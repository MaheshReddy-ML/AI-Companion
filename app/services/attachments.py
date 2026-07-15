from __future__ import annotations

import base64
import binascii
import re
import socket
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException

from app.database import attachments_collection, parse_object_id, utc_now
from app.config import settings


BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BASE_DIR / "uploads" / "attachments"
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
ALLOWED_MEDIA_TYPES = {
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
DATA_URL_PATTERN = re.compile(r"^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$", re.IGNORECASE)


def _is_valid_payload(media_type: str, raw: bytes) -> bool:
    if media_type == "application/pdf":
        return raw.startswith(b"%PDF-")
    if media_type == "image/png":
        return raw.startswith(b"\x89PNG\r\n\x1a\n")
    if media_type == "image/jpeg":
        return raw.startswith(b"\xff\xd8\xff")
    if media_type == "image/webp":
        return raw.startswith(b"RIFF") and raw[8:12] == b"WEBP"
    return media_type in {"text/plain", "text/markdown"}


def _scan_with_clamav(raw: bytes) -> None:
    """Use an optional local clamd Unix socket; fail closed when it is configured."""
    if not settings.clamav_socket:
        return
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(3)
            client.connect(settings.clamav_socket)
            client.sendall(b"zINSTREAM\0")
            client.sendall(len(raw).to_bytes(4, "big") + raw)
            client.sendall((0).to_bytes(4, "big"))
            result = client.recv(1024).decode("utf-8", "replace")
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Attachment scanning is temporarily unavailable.") from exc
    if "FOUND" in result:
        raise HTTPException(status_code=400, detail="Attachment was rejected by malware scanning.")
    if "OK" not in result:
        raise HTTPException(status_code=503, detail="Attachment scanning returned an unexpected result.")


def create_attachment(*, user_id, name: str, media_type: str, data_url: str) -> dict:
    normalized_type = media_type.lower().strip()
    if normalized_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail="Only PDF, TXT, Markdown, PNG, JPG, and WEBP files are supported.")

    match = DATA_URL_PATTERN.match(data_url.strip())
    if not match or match.group(1).lower() != normalized_type:
        raise HTTPException(status_code=400, detail="Attachment data does not match its declared file type.")
    try:
        raw = base64.b64decode(re.sub(r"\s+", "", match.group(2)), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Attachment data could not be decoded.") from exc
    if not raw or len(raw) > MAX_ATTACHMENT_BYTES or not _is_valid_payload(normalized_type, raw):
        raise HTTPException(status_code=400, detail="Attachment is empty, too large, or has an invalid file signature.")
    _scan_with_clamav(raw)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(name).name.strip() or "attachment"
    stored_name = f"{uuid4().hex}{ALLOWED_MEDIA_TYPES[normalized_type]}"
    path = UPLOAD_DIR / stored_name
    path.write_bytes(raw)
    document = {
        "user_id": user_id,
        "name": safe_name,
        "media_type": normalized_type,
        "size": len(raw),
        "path": str(path),
        "conversation_id": None,
        "created_at": utc_now(),
    }
    result = attachments_collection().insert_one(document)
    document["_id"] = result.inserted_id
    return serialize_attachment(document)


def get_attachment_or_404(attachment_id: str, user_id) -> dict:
    object_id = parse_object_id(attachment_id)
    attachment = attachments_collection().find_one({"_id": object_id, "user_id": user_id}) if object_id else None
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    return attachment


def serialize_attachment(document: dict) -> dict:
    return {
        "id": str(document["_id"]),
        "name": document["name"],
        "mediaType": document["media_type"],
        "size": document["size"],
        "downloadUrl": f"/api/chat/attachments/{document['_id']}",
    }


def delete_attachments_for_conversations(conversation_ids: list) -> None:
    if not conversation_ids:
        return
    attachments = list(attachments_collection().find({"conversation_id": {"$in": conversation_ids}}))
    for attachment in attachments:
        Path(attachment.get("path", "")).unlink(missing_ok=True)
    attachments_collection().delete_many({"conversation_id": {"$in": conversation_ids}})
