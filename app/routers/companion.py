from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from uuid import uuid4

from app.access import access_profile, usage_limits_for_user
from app.audit import audit_event
from app.companion import dashboard_from_messages
from app.database import conversations_collection, feature_collection, memories_collection, parse_object_id, utc_now
from app.preferences import get_user_preferences
from app.security import get_current_user, require_entitlement
from app.services.companion_chat import get_companion_reply


router = APIRouter(prefix="/api/companion", tags=["companion"])


class ExplicitMemoryRequest(BaseModel):
    value: str = Field(min_length=2, max_length=300)


class ReflectionRequest(BaseModel):
    conversation_id: str = Field(alias="conversationId", min_length=1, max_length=64)


def _arrival_for_user(user: dict, latest_check_in: dict | None, latest_conversation: dict | None, preferences: dict) -> dict:
    first_name = str(user.get("name") or "Friend").strip().split()[0]
    if preferences.get("quietHours"):
        return {
            "eyebrow": "YOUR SPACE IS QUIET",
            "headline": f"Welcome back, {first_name}.",
            "prompt": "No prompt, no pressure.",
            "message": "No prompts today. Emora is here whenever you choose to begin.",
            "source": "preference",
        }
    if latest_check_in:
        mood = str(latest_check_in.get("mood") or "").strip()
        mood_copy = {
            "heavy": "We can keep the next step small.",
            "scattered": "You only need to pick up one thread.",
            "energized": "There is energy to shape with care.",
            "quiet": "Nothing needs to fill the quiet.",
            "tired": "A slower pace still counts.",
            "anxious": "There is room to slow this down.",
            "low": "Very little is required of you here.",
        }.get(mood, "You can meet today exactly as it is.")
        return {
            "eyebrow": "PICK UP GENTLY",
            "headline": f"Welcome back, {first_name}.",
            "prompt": "What would help now?",
            "message": mood_copy,
            "source": "check-in",
        }
    if latest_conversation:
        title = str(latest_conversation.get("title") or "your last conversation").strip()
        return {
            "eyebrow": "CONTINUE WHEN READY",
            "headline": f"Good to see you, {first_name}.",
            "prompt": "Would you like to return?",
            "message": f"Your thread, “{title[:72]},” is here when you want it.",
            "source": "conversation",
        }
    return {
        "eyebrow": "YOUR COMPANION IS HERE",
        "headline": f"Welcome, {first_name}.",
        "prompt": "How would you like to begin?",
        "message": "You can speak, write, or take a quiet moment. There is no right way to begin.",
        "source": "welcome",
    }


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


@router.post("/memories", status_code=201)
def create_memory(payload: ExplicitMemoryRequest, current_user: dict = Depends(require_entitlement("companion_memory"))) -> dict:
    if not get_user_preferences(current_user["_id"])["emotionalMemory"]:
        raise HTTPException(status_code=409, detail="Emotional memory is paused in Profile settings.")
    now = utc_now()
    document = {
        "user_id": current_user["_id"],
        "category": "explicit",
        "key": f"user-{uuid4().hex}",
        "value": payload.value.strip(),
        "importance": 1.0,
        "source": "user",
        "created_at": now,
        "updated_at": now,
    }
    result = memories_collection().insert_one(document)
    document["_id"] = result.inserted_id
    return {"memory": _serialize_memory(document), "message": "Memory saved."}


@router.patch("/memories/{memory_id}")
def update_memory(memory_id: str, payload: ExplicitMemoryRequest, current_user: dict = Depends(get_current_user)) -> dict:
    """Let an owner correct retained memory, even after a plan downgrade."""
    object_id = parse_object_id(memory_id)
    memory = memories_collection().find_one_and_update(
        {"_id": object_id, "user_id": current_user["_id"]},
        {"$set": {"value": payload.value.strip(), "updated_at": utc_now()}},
        return_document=True,
    ) if object_id else None
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found.")
    return {"memory": _serialize_memory(memory), "message": "Memory updated."}


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
    preferences = get_user_preferences(current_user["_id"])
    latest_check_in = feature_collection("daily_check_ins").find_one({"user_id": current_user["_id"]}, sort=[("date", -1)])
    latest_conversation = conversations_collection().find_one({"user_id": current_user["_id"]}, {"title": 1, "updated_at": 1}, sort=[("updated_at", -1)])
    access = access_profile(current_user)
    return {
        "dashboard": dashboard_from_messages(messages, memory_count),
        "presence": {
            "states": ["IDLE", "WAKING", "LISTENING", "THINKING", "SPEAKING", "WAITING", "INTERRUPTED", "PAUSED", "ERROR", "ENDED"],
            "wakePhrase": "Hey Emora",
            "arrival": _arrival_for_user(current_user, latest_check_in, latest_conversation, preferences),
            "capabilities": {
                "voice": "voice" in access["entitlements"],
                "memory": "companion_memory" in access["entitlements"],
                "deepConversation": "deep_conversation" in access["entitlements"],
                "sessionReflection": "session_reflection" in access["entitlements"],
            },
        },
        "notice": "These values are conversation-based reflection signals, not a diagnosis or score of your worth.",
    }


@router.post("/reflections")
async def reflect_on_conversation(
    payload: ReflectionRequest,
    current_user: dict = Depends(require_entitlement("session_reflection")),
) -> dict:
    object_id = parse_object_id(payload.conversation_id)
    conversation = conversations_collection().find_one({"_id": object_id, "user_id": current_user["_id"]}) if object_id else None
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    history = [
        {"role": message.get("role"), "content": str(message.get("content") or "")}
        for message in conversation.get("messages", [])
        if message.get("role") in {"user", "assistant"} and str(message.get("content") or "").strip()
    ]
    if not any(item["role"] == "user" for item in history):
        raise HTTPException(status_code=409, detail="There is not enough conversation to reflect yet.")
    limits = usage_limits_for_user(current_user)
    try:
        reflection, _brain, model = await get_companion_reply(
            message="Reflect this conversation back to me before we close.",
            history=history,
            persona_prompt=(
                "You are Emora creating an optional end-of-session reflection. Use only the supplied conversation. "
                "Write 2 to 4 concise sentences: what the user seemed to be carrying, one strength or movement actually visible in their words, "
                "and one gentle question or next step. Do not diagnose, invent progress, or mention hidden analysis."
            ),
            companion_context="This reflection was explicitly requested by the user and is not saved as memory.",
            history_limit=max(24, limits["chatHistoryMessages"]),
            priority=False,
            requester_id=str(current_user["_id"]),
            requester_limit=limits["chatConcurrentRequests"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    audit_event("companion.reflection.generated", user_id=current_user["_id"], conversation_id=conversation["_id"])
    return {"reflection": reflection, "conversationId": str(conversation["_id"]), "model": model, "saved": False}
