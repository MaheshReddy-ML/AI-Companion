from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.audit import audit_event
from app.database import attachments_collection, conversations_collection, feature_collection, memories_collection, posts_collection, serialize_conversation, serialize_post, serialize_user, to_iso, users_collection, utc_now
from app.preferences import get_user_preferences
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
    journals = list(feature_collection("journal_entries").find({"user_id": current_user["_id"]}).sort("created_at", 1))
    goals = list(feature_collection("goals").find({"user_id": current_user["_id"]}).sort("created_at", 1))
    check_ins = list(feature_collection("daily_check_ins").find({"user_id": current_user["_id"]}).sort("date", 1))
    memories = list(memories_collection().find({"user_id": current_user["_id"]}).sort("created_at", 1))
    collections = list(feature_collection("conversation_collections").find({"user_id": current_user["_id"]}).sort("created_at", 1))
    research_shelf = list(feature_collection("research_shelf").find({"user_id": current_user["_id"]}).sort("created_at", 1))
    schedule = feature_collection("check_in_schedules").find_one({"user_id": current_user["_id"]}) or {}
    payload = {
        "format": "emora-account-export.v1",
        "profile": serialize_user(current_user),
        "conversations": [serialize_conversation(item) for item in conversations],
        "communityPosts": [serialize_post(item, current_anonymous_id=current_user.get("anonymous_id")) for item in posts],
        "attachments": [{"name": item["name"], "mediaType": item["media_type"], "size": item["size"]} for item in attachments],
        "journalEntries": [{"title": item.get("title"), "content": item.get("content"), "mood": item.get("mood"), "createdAt": to_iso(item.get("created_at")), "updatedAt": to_iso(item.get("updated_at"))} for item in journals],
        "goals": [{"title": item.get("title"), "note": item.get("note"), "completed": bool(item.get("completed")), "createdAt": to_iso(item.get("created_at")), "completedAt": to_iso(item.get("completed_at"))} for item in goals],
        "checkIns": [{"date": item.get("date"), "mood": item.get("mood"), "energy": item.get("energy"), "note": item.get("note"), "tinyThing": item.get("tiny_thing")} for item in check_ins],
        "memories": [{"category": item.get("category"), "value": item.get("value"), "importance": item.get("importance"), "createdAt": to_iso(item.get("created_at"))} for item in memories],
        "conversationCollections": [{"name": item.get("name"), "conversationIds": [str(value) for value in item.get("conversation_ids", [])], "createdAt": to_iso(item.get("created_at"))} for item in collections],
        "savedResearch": [{"title": item.get("title"), "url": item.get("url"), "domain": item.get("domain"), "note": item.get("note"), "tags": item.get("tags", []), "savedAt": to_iso(item.get("created_at"))} for item in research_shelf],
        "checkInSchedule": {"enabled": bool(schedule.get("enabled", False)), "channel": schedule.get("channel", "in_app"), "days": schedule.get("days", []), "time": schedule.get("time"), "timezone": schedule.get("timezone")},
        "preferences": get_user_preferences(current_user["_id"]),
    }
    audit_event("account.export", user_id=current_user["_id"])
    feature_collection("security_events").insert_one({"user_id": current_user["_id"], "kind": "account_export", "label": "Downloaded account data export", "created_at": utc_now()})
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
    feature_collection("response_feedback").delete_many({"user_id": current_user["_id"]})
    feature_collection("conversation_collections").update_many({"user_id": current_user["_id"]}, {"$set": {"conversation_ids": [], "updated_at": utc_now()}})
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
    for collection_name in (
        "auth_sessions", "security_events", "conversation_collections", "response_feedback", "research_shelf", "check_in_schedules",
        "journal_entries", "goals", "daily_check_ins", "user_preferences", "billing_requests", "quests", "user_spaces",
        "emora_moments", "daily_drops", "constellation_hidden", "taught_memories", "focus_room_presence",
    ):
        feature_collection(collection_name).delete_many({"user_id": current_user["_id"]})
    memories_collection().delete_many({"user_id": current_user["_id"]})
    audit_event("account.delete", user_id=current_user["_id"])
    return {"message": "Your account and associated data have been deleted."}
