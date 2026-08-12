from __future__ import annotations

import base64
import binascii
import logging
import random
import re
from pathlib import Path
from datetime import timedelta
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pymongo.errors import DuplicateKeyError

from app.audit import audit_event
from app.avatar_catalog import (
    choose_default_avatar_preset_id,
    get_avatar_preset,
    list_avatar_presets,
)
from app.config import settings
from app.database import serialize_user, users_collection, utc_now
from app.email_utils import send_email_html
from app.models.schemas import (
    AvatarPresetUpdateRequest,
    AvatarUploadRequest,
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SendOtpRequest,
    VerifyOtpRequest,
)
from app.otp import hash_otp, verify_otp_hash
from app.rate_limit import rate_limit
from app.security import create_access_token, get_current_user, hash_password, verify_password
from app.services.google_auth import (
    append_query_to_url,
    build_google_authorization_url,
    exchange_authorization_code,
    verify_google_id_token_value,
)


logger = logging.getLogger(__name__)
router = APIRouter(tags=["auth"])

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
AVATAR_UPLOAD_DIR = STATIC_DIR / "uploads" / "avatars"
MAX_AVATAR_BYTES = 3 * 1024 * 1024
DATA_URL_PATTERN = re.compile(r"^data:(image/(png|jpeg|jpg|webp));base64,(.+)$", re.IGNORECASE)
MIME_TO_EXTENSION = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
}
IMAGE_SIGNATURES = {
    "image/png": lambda raw: raw.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/jpeg": lambda raw: raw.startswith(b"\xff\xd8\xff"),
    "image/jpg": lambda raw: raw.startswith(b"\xff\xd8\xff"),
    "image/webp": lambda raw: raw.startswith(b"RIFF") and raw[8:12] == b"WEBP",
}


def build_auth_payload(user: dict) -> dict:
    return {
        "user": serialize_user(user),
        "token": create_access_token(str(user["_id"]), int(user.get("token_version", 0))),
    }


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_local_redirect_path(path: str | None) -> str | None:
    if not path:
        return None

    candidate = path.strip()
    parsed = urlsplit(candidate)
    if parsed.scheme or parsed.netloc:
        return None
    if not candidate.startswith("/") or candidate.startswith("//"):
        return None

    return candidate


def delete_existing_custom_avatar(user: dict) -> None:
    avatar_url = user.get("avatar_url")
    if user.get("avatar_source") != "custom" or not avatar_url:
        return

    prefix = "/static/uploads/avatars/"
    if not avatar_url.startswith(prefix):
        return

    filename = avatar_url.removeprefix(prefix)
    if Path(filename).name != filename:
        return

    candidate = AVATAR_UPLOAD_DIR / filename
    if candidate.exists():
        candidate.unlink(missing_ok=True)


def parse_avatar_data_url(image_data_url: str) -> tuple[str, bytes]:
    match = DATA_URL_PATTERN.match(image_data_url.strip())
    if not match:
        raise HTTPException(status_code=400, detail="Unsupported image format. Use PNG, JPG, or WEBP.")

    mime_type = match.group(1).lower()
    encoded = match.group(3)

    try:
        raw_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Image data could not be decoded.") from exc

    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Image payload is empty.")

    if len(raw_bytes) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="Avatar image is too large. Keep it under 3 MB.")

    if not IMAGE_SIGNATURES[mime_type](raw_bytes):
        raise HTTPException(status_code=400, detail="Image payload does not match the declared format.")

    extension = MIME_TO_EXTENSION[mime_type]
    return extension, raw_bytes


def upsert_google_user(payload: dict) -> dict:
    email = normalize_email(payload.get("email", ""))
    google_id = payload.get("sub", "")
    name = payload.get("name") or email.split("@")[0]

    users = users_collection()
    existing = users.find_one({"email": email})
    now = utc_now()

    if existing:
        updates: dict = {"updated_at": now}
        if not existing.get("google_id"):
            updates["google_id"] = google_id
        users.update_one({"_id": existing["_id"]}, {"$set": updates})
        return users.find_one({"_id": existing["_id"]})

    document = {
        "name": name.strip(),
        "email": email,
        "password_hash": None,
        "google_id": google_id,
        "auth_provider": "google",
        "avatar_source": "preset",
        "avatar_preset_id": choose_default_avatar_preset_id(email or name),
        "avatar_url": None,
        "reset_otp": None,
        "reset_otp_expiry": None,
        "reset_otp_verified": False,
        "token_version": 0,
        "created_at": now,
        "updated_at": now,
    }
    inserted = users.insert_one(document)
    document["_id"] = inserted.inserted_id
    return document


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit(8, 300, "auth-register"))],
)
def register_user(payload: RegisterRequest) -> dict:
    name = payload.name.strip()
    email = normalize_email(payload.email)
    password = payload.password

    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="Name, email, and password are required.")

    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    users = users_collection()
    now = utc_now()
    document = {
        "name": name,
        "email": email,
        "password_hash": hash_password(password),
        "google_id": None,
        "auth_provider": "local",
        "avatar_source": "preset",
        "avatar_preset_id": choose_default_avatar_preset_id(email or name),
        "avatar_url": None,
        "reset_otp": None,
        "reset_otp_expiry": None,
        "reset_otp_verified": False,
        "token_version": 0,
        "created_at": now,
        "updated_at": now,
    }
    try:
        inserted = users.insert_one(document)
    except DuplicateKeyError as exc:
        details = getattr(exc, "details", None) or {}
        key_pattern = details.get("keyPattern") or {}
        # Let MongoDB's unique index make the authoritative decision. This is
        # race-safe and must only call out an existing account when the email
        # index was the key that actually rejected the insert.
        if key_pattern and "email" not in key_pattern:
            logger.exception("Registration failed because of a non-email unique index: %s", key_pattern)
            raise HTTPException(status_code=500, detail="Account creation could not be completed. Please try again.") from exc
        audit_event("auth.register.duplicate", email=email)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists. Please sign in or use another email.",
        ) from exc
    document["_id"] = inserted.inserted_id
    audit_event("auth.register.success", user_id=document["_id"], email=email)
    return build_auth_payload(document)


@router.post("/login", dependencies=[Depends(rate_limit(12, 300, "auth-login"))])
def login_user(payload: LoginRequest) -> dict:
    email = normalize_email(payload.email)
    password = payload.password
    users = users_collection()
    user = users.find_one({"email": email})

    if not user:
        audit_event("auth.login.failed", email=email, reason="unknown_user")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.get("password_hash"):
        raise HTTPException(
            status_code=401,
            detail="This account uses Google sign-in. Please continue with Google.",
        )

    if not verify_password(password, user["password_hash"]):
        audit_event("auth.login.failed", user_id=user["_id"], email=email, reason="bad_password")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    now = utc_now()
    updates: dict = {"updated_at": now}
    # Existing local users may have a bcrypt hash created before the
    # SHA-256 pre-hash scheme. Upgrade it only after successful verification,
    # keeping old accounts usable without weakening password handling.
    if not user["password_hash"].startswith("bcrypt_sha256$"):
        updates["password_hash"] = hash_password(password)
        user["password_hash"] = updates["password_hash"]
    users.update_one({"_id": user["_id"]}, {"$set": updates})
    user["updated_at"] = now
    audit_event("auth.login.success", user_id=user["_id"], email=email)
    return build_auth_payload(user)


@router.post("/google", dependencies=[Depends(rate_limit(20, 300, "auth-google"))])
def google_login(payload: GoogleLoginRequest) -> dict:
    if not payload.token.strip():
        raise HTTPException(status_code=400, detail="Google token is missing")

    try:
        google_payload = verify_google_id_token_value(payload.token.strip())
        user = upsert_google_user(google_payload)
        audit_event("auth.google.success", user_id=user["_id"], email=user.get("email"))
        return build_auth_payload(user)
    except ValueError as exc:
        logger.warning("Google authentication failed: %s", exc)
        audit_event("auth.google.failed", reason=str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/google/start", response_model=None)
def google_start(next_path: str | None = Query(default=None, alias="next")) -> RedirectResponse:
    try:
        return RedirectResponse(build_google_authorization_url(state=normalize_local_redirect_path(next_path)))
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/verify")
def verify_session(current_user: dict = Depends(get_current_user)) -> dict:
    return {"user": serialize_user(current_user), "verified": True}


@router.post("/logout")
def logout_all_sessions(current_user: dict = Depends(get_current_user)) -> dict:
    next_version = int(current_user.get("token_version", 0)) + 1
    users_collection().update_one(
        {"_id": current_user["_id"]},
        {"$set": {"token_version": next_version, "updated_at": utc_now()}},
    )
    audit_event("auth.logout_all.success", user_id=current_user["_id"])
    return {"message": "Signed out from all sessions."}


@router.get("/avatar-presets")
def avatar_presets() -> dict:
    return {"presets": list_avatar_presets()}


@router.put("/profile/avatar/preset")
def update_profile_avatar_preset(
    payload: AvatarPresetUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    preset = get_avatar_preset(payload.preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Avatar preset not found.")

    delete_existing_custom_avatar(current_user)
    users_collection().update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {
                "avatar_source": "preset",
                "avatar_preset_id": preset["id"],
                "avatar_url": None,
                "updated_at": utc_now(),
            }
        },
    )
    user = users_collection().find_one({"_id": current_user["_id"]})
    return {"message": "Avatar updated.", "user": serialize_user(user)}


@router.put("/profile/avatar/upload")
def upload_profile_avatar(
    payload: AvatarUploadRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    extension, raw_bytes = parse_avatar_data_url(payload.image_data_url)

    AVATAR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{current_user['_id']}-{uuid4().hex}{extension}"
    destination = AVATAR_UPLOAD_DIR / filename
    destination.write_bytes(raw_bytes)

    delete_existing_custom_avatar(current_user)
    avatar_url = f"/static/uploads/avatars/{filename}"

    users_collection().update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {
                "avatar_source": "custom",
                "avatar_preset_id": None,
                "avatar_url": avatar_url,
                "updated_at": utc_now(),
            }
        },
    )
    user = users_collection().find_one({"_id": current_user["_id"]})
    return {"message": "Custom avatar saved.", "user": serialize_user(user)}


@router.post("/send-otp", dependencies=[Depends(rate_limit(5, 600, "auth-send-otp"))])
def send_otp(payload: SendOtpRequest) -> dict:
    email = normalize_email(payload.email)
    users = users_collection()
    user = users.find_one({"email": email})
    if not user:
        audit_event("auth.otp.request.failed", email=email, reason="unknown_user")
        raise HTTPException(status_code=404, detail="User not found")

    otp = f"{random.randint(100000, 999999)}"
    expiry = utc_now() + timedelta(minutes=10)

    users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "reset_otp": None,
                "reset_otp_hash": hash_otp(otp),
                "reset_otp_expiry": expiry,
                "reset_otp_verified": False,
                "updated_at": utc_now(),
            }
        },
    )

    delivered = send_email_html(
        email,
        "Your Verification Code",
        f"<h3>Your OTP is: <b style='color:#1b7eb1;'>{otp}</b></h3><p>Valid for 10 minutes.</p>",
    )

    if not delivered:
        logger.warning("OTP for %s generated but email was not delivered because SMTP is not configured.", email)
        audit_event("auth.otp.generated", user_id=user["_id"], email=email, delivered=False)
        return {"message": "OTP generated. Configure email settings to deliver it."}

    audit_event("auth.otp.generated", user_id=user["_id"], email=email, delivered=True)
    return {"message": "OTP sent successfully"}


@router.post("/verify-otp", dependencies=[Depends(rate_limit(10, 600, "auth-verify-otp"))])
def verify_otp(payload: VerifyOtpRequest) -> dict:
    email = normalize_email(payload.email)
    otp = payload.otp.strip()
    user = users_collection().find_one({"email": email})
    if not user:
        audit_event("auth.otp.verify.failed", email=email, reason="unknown_user")
        raise HTTPException(status_code=404, detail="User not found")

    expiry = user.get("reset_otp_expiry")
    if not verify_otp_hash(otp, user.get("reset_otp_hash") or user.get("reset_otp")) or not expiry or expiry < utc_now():
        audit_event("auth.otp.verify.failed", user_id=user["_id"], email=email, reason="invalid_or_expired")
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    users_collection().update_one(
        {"_id": user["_id"]},
        {"$set": {"reset_otp_verified": True, "updated_at": utc_now()}},
    )
    audit_event("auth.otp.verify.success", user_id=user["_id"], email=email)
    return {"message": "OTP Verified"}


@router.post("/reset-password", dependencies=[Depends(rate_limit(5, 600, "auth-reset-password"))])
def reset_password(payload: ResetPasswordRequest) -> dict:
    email = normalize_email(payload.email)
    user = users_collection().find_one({"email": email})
    if not user:
        audit_event("auth.password_reset.failed", email=email, reason="unknown_user")
        raise HTTPException(status_code=404, detail="User not found")

    if not user.get("reset_otp_verified"):
        audit_event("auth.password_reset.failed", user_id=user["_id"], email=email, reason="otp_not_verified")
        raise HTTPException(status_code=400, detail="OTP not verified")

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    users_collection().update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": hash_password(payload.new_password),
                "auth_provider": "local",
                "reset_otp": None,
                "reset_otp_hash": None,
                "reset_otp_expiry": None,
                "reset_otp_verified": False,
                "token_version": int(user.get("token_version", 0)) + 1,
                "updated_at": utc_now(),
            }
        },
    )
    audit_event("auth.password_reset.success", user_id=user["_id"], email=email)
    return {"message": "Password reset successful"}


@router.get("/google/callback", response_model=None)
async def google_callback(
    code: str | None = None,
    error: str | None = None,
    error_description: str | None = Query(default=None, alias="error_description"),
    state: str | None = None,
) -> RedirectResponse | dict:
    next_path = normalize_local_redirect_path(state)
    failure_redirect = next_path or settings.google_auth_failure_redirect
    success_redirect = next_path or settings.google_auth_success_redirect

    if error:
        if failure_redirect:
            return RedirectResponse(append_query_to_url(failure_redirect, {"error": error_description or error}))
        raise HTTPException(status_code=400, detail=f"Google callback error: {error_description or error}")

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code in callback.")

    try:
        payload = await exchange_authorization_code(code)
        user = upsert_google_user(payload)
        auth_payload = build_auth_payload(user)
    except ValueError as exc:
        logger.warning("Google callback failed: %s", exc)
        if failure_redirect:
            return RedirectResponse(append_query_to_url(failure_redirect, {"error": str(exc)}))
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if success_redirect:
        return RedirectResponse(
            append_query_to_url(
                success_redirect,
                {
                    "token": auth_payload["token"],
                    "userId": auth_payload["user"]["_id"],
                    "email": auth_payload["user"]["email"],
                    "name": auth_payload["user"]["name"],
                },
            )
        )

    return auth_payload
