from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.audit import audit_event
from app.database import attachments_collection, conversations_collection, posts_collection, serialize_conversation, serialize_post, serialize_user, users_collection
from app.security import get_current_user
from app.services.attachments import delete_attachments_for_conversations


router = APIRouter(prefix="/api/account", tags=["account"])


def _owned_conversations(user_id) -> list[dict]:
    return list(conversations_collection().find({"user_id": user_id}).sort("created_at", 1))


@router.get("/export")
def export_account_data(current_user: dict = Depends(get_current_user)) -> Response:
    conversations = _owned_conversations(current_user["_id"])
    posts = list(posts_collection().find({"anonymous_id": current_user.get("anonymous_id")}).sort("created_at", 1)) if current_user.get("anonymous_id") else []
    attachments = list(attachments_collection().find({"user_id": current_user["_id"]}))
    payload = {
        "format": "emora-account-export.v1",
        "profile": serialize_user(current_user),
        "conversations": [serialize_conversation(item) for item in conversations],
        "communityPosts": [serialize_post(item, current_anonymous_id=current_user.get("anonymous_id")) for item in posts],
        "attachments": [{"name": item["name"], "mediaType": item["media_type"], "size": item["size"]} for item in attachments],
    }
    audit_event("account.export", user_id=current_user["_id"])
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="emora-account-data.json"', "Cache-Control": "private, no-store"},
    )


@router.delete("/history")
def clear_conversation_history(current_user: dict = Depends(get_current_user)) -> dict:
    conversations = _owned_conversations(current_user["_id"])
    delete_attachments_for_conversations([item["_id"] for item in conversations])
    conversations_collection().delete_many({"user_id": current_user["_id"]})
    audit_event("account.history.clear", user_id=current_user["_id"], conversations=len(conversations))
    return {"message": "Your conversation history has been permanently deleted."}


@router.delete("")
def delete_account(current_user: dict = Depends(get_current_user)) -> dict:
    conversations = _owned_conversations(current_user["_id"])
    delete_attachments_for_conversations([item["_id"] for item in conversations])
    for attachment in attachments_collection().find({"user_id": current_user["_id"]}):
        Path(attachment.get("path", "")).unlink(missing_ok=True)
    attachments_collection().delete_many({"user_id": current_user["_id"]})
    conversations_collection().delete_many({"user_id": current_user["_id"]})
    if current_user.get("anonymous_id"):
        posts_collection().delete_many({"anonymous_id": current_user["anonymous_id"]})
    avatar_url = current_user.get("avatar_url") or ""
    if current_user.get("avatar_source") == "custom" and avatar_url.startswith("/static/uploads/avatars/"):
        avatar_path = Path(__file__).resolve().parents[1] / "static" / avatar_url.removeprefix("/static/")
        avatar_path.unlink(missing_ok=True)
    users_collection().delete_one({"_id": current_user["_id"]})
    audit_event("account.delete", user_id=current_user["_id"])
    return {"message": "Your account and associated data have been deleted."}
