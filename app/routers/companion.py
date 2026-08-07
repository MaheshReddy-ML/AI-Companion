from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.companion import dashboard_from_messages
from app.database import conversations_collection, memories_collection, parse_object_id
from app.security import get_current_user


router = APIRouter(prefix="/api/companion", tags=["companion"])


def _serialize_memory(item: dict) -> dict:
    expires_at = item.get("expires_at")
    return {
        "id": str(item["_id"]),
        "category": item.get("category", "memory"),
        "key": item.get("key", "detail"),
        "value": item.get("value", ""),
        "importance": float(item.get("importance", 0.5)),
        "createdAt": item.get("created_at").astimezone(timezone.utc).isoformat() if item.get("created_at") else None,
        "updatedAt": item.get("updated_at").astimezone(timezone.utc).isoformat() if item.get("updated_at") else None,
        "expiresAt": expires_at.astimezone(timezone.utc).isoformat() if expires_at else None,
    }


@router.get("/memories")
def list_memories(
    include_expired: bool = Query(default=False),
    current_user: dict = Depends(get_current_user),
) -> dict:
    query: dict = {"user_id": current_user["_id"]}
    if not include_expired:
        now = datetime.now(timezone.utc)
        query["$or"] = [{"expires_at": {"$exists": False}}, {"expires_at": None}, {"expires_at": {"$gte": now}}]
    memories = memories_collection().find(query).sort([("importance", -1), ("updated_at", -1)]).limit(200)
    return {"memories": [_serialize_memory(item) for item in memories], "notice": "Only explicit, useful details are saved. You can remove any memory here."}


@router.delete("/memories/{memory_id}")
def delete_memory(memory_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(memory_id)
    if not object_id or not memories_collection().delete_one({"_id": object_id, "user_id": current_user["_id"]}).deleted_count:
        raise HTTPException(status_code=404, detail="Memory not found.")
    return {"message": "Memory removed."}


@router.get("/dashboard")
def get_dashboard(current_user: dict = Depends(get_current_user)) -> dict:
    conversations = conversations_collection().find({"user_id": current_user["_id"]}, {"messages": 1})
    messages = [message for conversation in conversations for message in conversation.get("messages", [])]
    memory_count = memories_collection().count_documents({"user_id": current_user["_id"], "$or": [{"expires_at": {"$exists": False}}, {"expires_at": None}, {"expires_at": {"$gte": datetime.now(timezone.utc)}}]})
    return {
        "dashboard": dashboard_from_messages(messages, memory_count),
        "notice": "These values are conversation-based reflection signals, not a diagnosis or score of your worth.",
    }
