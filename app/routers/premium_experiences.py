from __future__ import annotations

from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from app.access import active_plan_for_user, has_entitlement
from app.audit import audit_event
from app.database import as_utc, conversations_collection, feature_collection, memories_collection, parse_object_id, to_iso, utc_now
from app.notifications import create_notification
from app.security import get_current_user


router = APIRouter(prefix="/api/premium", tags=["premium-experiences"])

SESSION_MODES = {"listen", "reflect", "plan", "focus", "deep"}
SESSION_CHANNELS = {"text", "voice"}
SESSION_ENVIRONMENT_PLANS = {
    "midnight": "free", "dawn": "free", "rainy-window": "plus", "quiet-forest": "plus", "deep-ocean": "plus",
    "observatory": "pro", "fireplace": "pro", "space": "pro", "aurora": "complete",
}
SESSION_ENVIRONMENTS = set(SESSION_ENVIRONMENT_PLANS)


class SessionCreateRequest(BaseModel):
    intention: str = Field(default="", max_length=240)
    mode: Literal["listen", "reflect", "plan", "focus", "deep"] = "listen"
    channel: Literal["text", "voice"] = "text"
    environment: str = Field(default="midnight", min_length=2, max_length=40)
    duration_minutes: int | None = Field(default=20, alias="durationMinutes", ge=5, le=120)

    model_config = {"populate_by_name": True}


class SessionUpdateRequest(BaseModel):
    conversation_id: str | None = Field(default=None, alias="conversationId", max_length=64)
    note: str | None = Field(default=None, max_length=1000)
    status: Literal["active", "paused"] | None = None

    model_config = {"populate_by_name": True}


class SessionCompleteRequest(BaseModel):
    reflection: str = Field(default="", max_length=1200)
    next_step: str = Field(default="", alias="nextStep", max_length=240)
    memory_choice: Literal["none", "review"] = Field(default="none", alias="memoryChoice")

    model_config = {"populate_by_name": True}


class WeeklyReviewRequest(BaseModel):
    meaningful: str = Field(default="", max_length=1200)
    changed: str = Field(default="", max_length=1200)
    remember: str = Field(default="", max_length=300)
    forget: str = Field(default="", max_length=300)
    next_step: str = Field(default="", alias="nextStep", max_length=240)

    model_config = {"populate_by_name": True}


class MemoryUpdateRequest(BaseModel):
    value: str | None = Field(default=None, min_length=2, max_length=300)
    expires_in_days: int | None = Field(default=None, alias="expiresInDays", ge=1, le=3650)

    model_config = {"populate_by_name": True}


def _require_session_access(user: dict, mode: str, channel: str) -> None:
    if mode == "deep" and not has_entitlement(user, "deep_sessions"):
        raise HTTPException(status_code=403, detail="Deep Sessions are included with Emora Pro.")
    if channel == "voice" and not has_entitlement(user, "voice"):
        raise HTTPException(status_code=403, detail="Voice sessions are included with Emora Plus.")


def _serialize_session(item: dict) -> dict:
    return {
        "id": str(item["_id"]),
        "intention": item.get("intention", ""),
        "mode": item.get("mode", "listen"),
        "channel": item.get("channel", "text"),
        "environment": item.get("environment", "midnight"),
        "durationMinutes": item.get("duration_minutes"),
        "conversationId": str(item["conversation_id"]) if item.get("conversation_id") else None,
        "status": item.get("status", "active"),
        "note": item.get("note", ""),
        "reflection": item.get("reflection", ""),
        "nextStep": item.get("next_step", ""),
        "memoryChoice": item.get("memory_choice", "none"),
        "startedAt": to_iso(item.get("started_at")),
        "updatedAt": to_iso(item.get("updated_at")),
        "completedAt": to_iso(item.get("completed_at")),
    }


@router.get("/sessions")
def list_sessions(
    status: Literal["active", "paused", "completed"] | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
) -> dict:
    query: dict = {"user_id": current_user["_id"]}
    if status:
        query["status"] = status
    items = feature_collection("emora_sessions").find(query).sort("updated_at", -1).limit(limit)
    return {"sessions": [_serialize_session(item) for item in items]}


@router.get("/sessions/current")
def current_session(current_user: dict = Depends(get_current_user)) -> dict:
    item = feature_collection("emora_sessions").find_one(
        {"user_id": current_user["_id"], "status": {"$in": ["active", "paused"]}},
        sort=[("updated_at", -1)],
    )
    return {"session": _serialize_session(item) if item else None}


@router.post("/sessions", status_code=201)
def create_session(payload: SessionCreateRequest, current_user: dict = Depends(get_current_user)) -> dict:
    _require_session_access(current_user, payload.mode, payload.channel)
    if payload.environment not in SESSION_ENVIRONMENTS:
        raise HTTPException(status_code=400, detail="Choose a supported Emora environment.")
    order = ("free", "plus", "pro", "complete")
    plan = active_plan_for_user(current_user)
    if order.index(SESSION_ENVIRONMENT_PLANS[payload.environment]) > order.index(plan):
        required = SESSION_ENVIRONMENT_PLANS[payload.environment].title()
        raise HTTPException(status_code=403, detail=f"This environment is included with Emora {required}.")
    now = utc_now()
    collection = feature_collection("emora_sessions")
    collection.update_many(
        {"user_id": current_user["_id"], "status": "active"},
        {"$set": {"status": "paused", "updated_at": now}},
    )
    document = {
        "user_id": current_user["_id"],
        "intention": " ".join(payload.intention.split()),
        "mode": payload.mode,
        "channel": payload.channel,
        "environment": payload.environment,
        "duration_minutes": payload.duration_minutes,
        "status": "active",
        "started_at": now,
        "updated_at": now,
    }
    result = collection.insert_one(document)
    document["_id"] = result.inserted_id
    audit_event("premium.session.start", user_id=current_user["_id"], session_id=document["_id"], mode=payload.mode, channel=payload.channel)
    return {"session": _serialize_session(document)}


@router.patch("/sessions/{session_id}")
def update_session(session_id: str, payload: SessionUpdateRequest, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(session_id)
    if not object_id:
        raise HTTPException(status_code=404, detail="Session not found.")
    changes = payload.model_dump(exclude_none=True, by_alias=False)
    if "conversation_id" in changes:
        conversation_id = parse_object_id(changes.pop("conversation_id"))
        if not conversation_id or not conversations_collection().find_one({"_id": conversation_id, "user_id": current_user["_id"]}):
            raise HTTPException(status_code=404, detail="Conversation not found.")
        changes["conversation_id"] = conversation_id
    if "note" in changes:
        changes["note"] = " ".join(changes["note"].split())
    changes["updated_at"] = utc_now()
    item = feature_collection("emora_sessions").find_one_and_update(
        {"_id": object_id, "user_id": current_user["_id"], "status": {"$in": ["active", "paused"]}},
        {"$set": changes},
        return_document=ReturnDocument.AFTER,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Active session not found.")
    return {"session": _serialize_session(item)}


@router.post("/sessions/{session_id}/complete")
def complete_session(session_id: str, payload: SessionCompleteRequest, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(session_id)
    now = utc_now()
    item = feature_collection("emora_sessions").find_one_and_update(
        {"_id": object_id, "user_id": current_user["_id"], "status": {"$in": ["active", "paused"]}},
        {"$set": {
            "status": "completed",
            "reflection": payload.reflection.strip(),
            "next_step": payload.next_step.strip(),
            "memory_choice": payload.memory_choice,
            "completed_at": now,
            "updated_at": now,
        }},
        return_document=ReturnDocument.AFTER,
    ) if object_id else None
    if not item:
        raise HTTPException(status_code=404, detail="Active session not found.")
    audit_event("premium.session.complete", user_id=current_user["_id"], session_id=item["_id"], memory_choice=payload.memory_choice)
    create_notification(
        current_user["_id"],
        category="celebration",
        title="A little space, well held ✨",
        message="Your Emora Session is complete. Your reflection and next step are waiting whenever you want them.",
        action_path="/sessions",
        action_label="View reflection",
        dedupe_key=f"session-complete:{item['_id']}",
        celebration=True,
    )
    return {"session": _serialize_session(item)}


def _week_key(now=None) -> str:
    current = now or utc_now()
    year, week, _ = current.isocalendar()
    return f"{year}-W{week:02d}"


def _weekly_sources(user_id) -> dict:
    since = utc_now() - timedelta(days=7)
    conversations = list(conversations_collection().find({"user_id": user_id, "updated_at": {"$gte": since}}, {"title": 1, "updated_at": 1}).sort("updated_at", -1).limit(20))
    journals = list(feature_collection("journal_entries").find({"user_id": user_id, "created_at": {"$gte": since}}, {"title": 1, "mood": 1, "created_at": 1}).sort("created_at", -1).limit(20))
    goals = list(feature_collection("goals").find({"user_id": user_id, "$or": [{"created_at": {"$gte": since}}, {"completed_at": {"$gte": since}}]}, {"title": 1, "completed": 1, "created_at": 1, "completed_at": 1}).sort("created_at", -1).limit(20))
    moments = list(feature_collection("emora_moments").find({"user_id": user_id, "created_at": {"$gte": since}}, {"quote": 1, "category": 1, "created_at": 1}).sort("created_at", -1).limit(20))
    return {
        "counts": {"conversations": len(conversations), "journals": len(journals), "goals": len(goals), "moments": len(moments)},
        "conversations": [{"title": item.get("title", "Conversation"), "date": to_iso(item.get("updated_at"))} for item in conversations[:5]],
        "journals": [{"title": item.get("title") or "Untitled reflection", "mood": item.get("mood"), "date": to_iso(item.get("created_at"))} for item in journals[:5]],
        "goals": [{"title": item.get("title", "Goal"), "completed": bool(item.get("completed")), "date": to_iso(item.get("completed_at") or item.get("created_at"))} for item in goals[:5]],
        "moments": [{"quote": str(item.get("quote", ""))[:240], "category": item.get("category", "memory"), "date": to_iso(item.get("created_at"))} for item in moments[:5]],
    }


def _serialize_review(item: dict | None) -> dict | None:
    if not item:
        return None
    return {
        "id": str(item["_id"]), "weekKey": item["week_key"], "meaningful": item.get("meaningful", ""),
        "changed": item.get("changed", ""), "remember": item.get("remember", ""), "forget": item.get("forget", ""),
        "nextStep": item.get("next_step", ""), "createdAt": to_iso(item.get("created_at")), "updatedAt": to_iso(item.get("updated_at")),
    }


@router.get("/weekly-review")
def get_weekly_review(current_user: dict = Depends(get_current_user)) -> dict:
    if not has_entitlement(current_user, "weekly_review"):
        return {"available": False, "review": None, "sources": _weekly_sources(current_user["_id"]), "plan": "Plus"}
    item = feature_collection("weekly_reviews").find_one({"user_id": current_user["_id"], "week_key": _week_key()})
    return {"available": True, "review": _serialize_review(item), "sources": _weekly_sources(current_user["_id"]), "plan": "Plus"}


@router.put("/weekly-review")
def save_weekly_review(payload: WeeklyReviewRequest, current_user: dict = Depends(get_current_user)) -> dict:
    if not has_entitlement(current_user, "weekly_review"):
        raise HTTPException(status_code=403, detail="Weekly Review is included with Emora Plus.")
    now = utc_now()
    week_key = _week_key(now)
    values = {
        "meaningful": payload.meaningful.strip(), "changed": payload.changed.strip(),
        "remember": payload.remember.strip(), "forget": payload.forget.strip(), "next_step": payload.next_step.strip(),
        "updated_at": now,
    }
    item = feature_collection("weekly_reviews").find_one_and_update(
        {"user_id": current_user["_id"], "week_key": week_key},
        {"$set": values, "$setOnInsert": {"user_id": current_user["_id"], "week_key": week_key, "created_at": now}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    audit_event("premium.weekly_review.save", user_id=current_user["_id"], week_key=week_key)
    create_notification(
        current_user["_id"],
        category="celebration",
        title="Your week is yours ✨",
        message="You made time to notice what mattered. Your confirmed Weekly Review is now saved privately.",
        action_path="/sessions#weekly-review",
        action_label="Read my review",
        dedupe_key=f"weekly-review-saved:{week_key}",
        celebration=True,
    )
    return {"review": _serialize_review(item)}


def _memory_source(user_id, source_message_id: str | None) -> dict | None:
    if not source_message_id:
        return None
    conversation = conversations_collection().find_one(
        {"user_id": user_id, "messages.id": source_message_id},
        {"title": 1, "messages.$": 1},
    )
    if not conversation:
        return None
    message = (conversation.get("messages") or [{}])[0]
    return {"conversationId": str(conversation["_id"]), "conversationTitle": conversation.get("title", "Conversation"), "messageId": source_message_id, "excerpt": str(message.get("content", ""))[:240]}


def _serialize_memory(item: dict, user_id) -> dict:
    return {
        "id": str(item["_id"]), "category": item.get("category", "taught"), "key": item.get("key", ""),
        "label": item.get("label") or item.get("category", "Memory").replace("_", " ").title(), "value": item.get("value", ""),
        "why": "You explicitly asked Emora to keep this." if item.get("source") == "explicit_user" or item.get("category") == "taught" else "This was extracted from an explicit personal fact you shared.",
        "source": _memory_source(user_id, item.get("source_message_id")), "lastUsedAt": to_iso(item.get("last_used_at")),
        "useCount": int(item.get("use_count", 0)), "createdAt": to_iso(item.get("created_at")), "updatedAt": to_iso(item.get("updated_at")),
        "expiresAt": to_iso(item.get("expires_at")), "pendingConflict": {
            "value": item.get("pending_conflict", {}).get("value", ""),
            "detectedAt": to_iso(item.get("pending_conflict", {}).get("detected_at")),
        } if item.get("pending_conflict") else None,
    }


@router.get("/memory-center")
def memory_center(current_user: dict = Depends(get_current_user)) -> dict:
    if not has_entitlement(current_user, "memory_center"):
        return {"available": False, "memories": [], "plan": "Plus"}
    items = memories_collection().find({"user_id": current_user["_id"]}).sort("updated_at", -1).limit(500)
    return {"available": True, "memories": [_serialize_memory(item, current_user["_id"]) for item in items], "plan": "Plus"}


@router.patch("/memory-center/{memory_id}")
def update_memory(memory_id: str, payload: MemoryUpdateRequest, current_user: dict = Depends(get_current_user)) -> dict:
    if not has_entitlement(current_user, "memory_center"):
        raise HTTPException(status_code=403, detail="Memory Center is included with Emora Plus.")
    object_id = parse_object_id(memory_id)
    changes: dict = {"updated_at": utc_now()}
    if payload.value is not None:
        changes["value"] = " ".join(payload.value.split())
    if payload.expires_in_days is not None:
        changes["expires_at"] = utc_now() + timedelta(days=payload.expires_in_days)
    update: dict = {"$set": changes}
    if payload.value is not None:
        update["$unset"] = {"pending_conflict": ""}
    item = memories_collection().find_one_and_update({"_id": object_id, "user_id": current_user["_id"]}, update, return_document=ReturnDocument.AFTER) if object_id else None
    if not item:
        raise HTTPException(status_code=404, detail="Memory not found.")
    return {"memory": _serialize_memory(item, current_user["_id"])}


@router.delete("/memory-center/{memory_id}")
def delete_memory(memory_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    if not has_entitlement(current_user, "memory_center"):
        raise HTTPException(status_code=403, detail="Memory Center is included with Emora Plus.")
    object_id = parse_object_id(memory_id)
    if not object_id or not memories_collection().delete_one({"_id": object_id, "user_id": current_user["_id"]}).deleted_count:
        raise HTTPException(status_code=404, detail="Memory not found.")
    return {"message": "Memory removed."}
