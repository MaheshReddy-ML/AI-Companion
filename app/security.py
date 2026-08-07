from __future__ import annotations

import base64
from datetime import timedelta
import hashlib

import bcrypt

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.database import parse_object_id, users_collection, utc_now


BCRYPT_SHA256_PREFIX = "bcrypt_sha256$"
bearer_scheme = HTTPBearer(auto_error=False)


def _password_digest(password: str) -> bytes:
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(_password_digest(password), bcrypt.gensalt())
    return f"{BCRYPT_SHA256_PREFIX}{hashed.decode('utf-8')}"


def verify_password(password: str, hashed_password: str) -> bool:
    if hashed_password.startswith(BCRYPT_SHA256_PREFIX):
        hashed_value = hashed_password.removeprefix(BCRYPT_SHA256_PREFIX).encode("utf-8")
        return bcrypt.checkpw(_password_digest(password), hashed_value)

    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: str, token_version: int = 0) -> str:
    expires_at = utc_now() + timedelta(days=settings.access_token_expire_days)
    payload = {"sub": user_id, "exp": expires_at, "tv": token_version}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authorized, token failed",
        ) from exc


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authorized, no token",
        )

    payload = decode_access_token(credentials.credentials)
    user_id = parse_object_id(payload.get("sub", ""))

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authorized, token failed",
        )

    user = users_collection().find_one({"_id": user_id})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authorized, user not found",
        )

    token_version = int(payload.get("tv", 0))
    user_token_version = int(user.get("token_version", 0))
    if token_version != user_token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authorized, session expired",
        )

    return user
