from __future__ import annotations

import hashlib
import re
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from app.access import active_plan_for_user, has_entitlement, usage_limits_for_user
from app.companion import dashboard_from_messages
from app.database import as_utc, conversations_collection, feature_collection, memories_collection, parse_object_id, to_iso, utc_now
from app.security import get_current_user


router = APIRouter(prefix="/api/experiences", tags=["experiences"])

MOMENT_CATEGORIES = {"reflection", "milestone", "idea", "joy", "growth", "memory"}
ENVIRONMENTS = {
    "midnight": "free", "dawn": "free",
    "rainy-window": "plus", "quiet-forest": "plus", "deep-ocean": "plus",
    "observatory": "pro", "fireplace": "pro", "space": "pro",
    "aurora": "complete",
}
DROP_PROMPTS = (
    "What deserves five quiet minutes today?",
    "What would make today feel a little more yours?",
    "What are you ready to make simpler?",
    "What is one thing worth noticing before the day moves on?",
    "What would you try if it only had to be a first draft?",
    "What small kindness could you offer your future self?",
    "What idea has been asking for your attention?",
    "Where could you choose curiosity over pressure today?",
)


class MomentCreateRequest(BaseModel):
    conversation_id: str = Field(alias="conversationId")
    message_id: str = Field(alias="messageId", min_length=1, max_length=80)
    category: str = Field(default="memory", pattern="^(reflection|milestone|idea|joy|growth|memory)$")
    note: str = Field(default="", max_length=280)


class MomentUpdateRequest(BaseModel):
    category: str | None = Field(default=None, pattern="^(reflection|milestone|idea|joy|growth|memory)$")
    note: str | None = Field(default=None, max_length=280)


class TaughtMemoryRequest(BaseModel):
    value: str = Field(min_length=2, max_length=300)
    label: str = Field(default="About me", min_length=1, max_length=60)


class EnvironmentRequest(BaseModel):
    environment: str = Field(min_length=2, max_length=40)


def _serialize_moment(item: dict) -> dict:
    return {
        "id": str(item["_id"]), "quote": item["quote"], "speaker": item.get("speaker", "You"),
        "category": item.get("category", "memory"), "note": item.get("note", ""),
        "conversationId": str(item["conversation_id"]), "messageId": item["message_id"],
        "createdAt": to_iso(item.get("created_at")), "updatedAt": to_iso(item.get("updated_at")),
    }


def _serialize_taught(item: dict) -> dict:
    return {"id": str(item["_id"]), "label": item.get("label", "About me"), "value": item["value"], "createdAt": to_iso(item.get("created_at")), "updatedAt": to_iso(item.get("updated_at"))}


def _owned_message(user_id, conversation_id: str, message_id: str) -> tuple[dict, dict]:
    object_id = parse_object_id(conversation_id)
    conversation = conversations_collection().find_one({"_id": object_id, "user_id": user_id}) if object_id else None
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    message = next((item for item in conversation.get("messages", []) if str(item.get("id")) == message_id), None)
    if not message:
        raise HTTPException(status_code=404, detail="Conversation moment not found.")
    return conversation, message


@router.get("/moments")
def list_moments(current_user: dict = Depends(get_current_user)) -> dict:
    items = feature_collection("emora_moments").find({"user_id": current_user["_id"]}).sort("created_at", -1).limit(500)
    return {"moments": [_serialize_moment(item) for item in items], "limit": usage_limits_for_user(current_user)["moments"]}


@router.post("/moments", status_code=201)
def save_moment(payload: MomentCreateRequest, current_user: dict = Depends(get_current_user)) -> dict:
    collection = feature_collection("emora_moments")
    conversation, message = _owned_message(current_user["_id"], payload.conversation_id, payload.message_id)
    existing = collection.find_one({"user_id": current_user["_id"], "conversation_id": conversation["_id"], "message_id": payload.message_id})
    if existing:
        return {"moment": _serialize_moment(existing), "created": False}
    limit = usage_limits_for_user(current_user)["moments"]
    if collection.count_documents({"user_id": current_user["_id"]}) >= limit:
        raise HTTPException(status_code=403, detail=f"Your current plan keeps up to {limit} saved moments.")
    now = utc_now()
    document = {
        "user_id": current_user["_id"], "conversation_id": conversation["_id"], "message_id": payload.message_id,
        "quote": str(message.get("content", "")).strip()[:1200], "speaker": "Emora" if message.get("role") == "assistant" else "You",
        "category": payload.category, "note": payload.note.strip(), "created_at": now, "updated_at": now,
    }
    try:
        result = collection.insert_one(document)
        document["_id"] = result.inserted_id
    except DuplicateKeyError:
        document = collection.find_one({"user_id": current_user["_id"], "conversation_id": conversation["_id"], "message_id": payload.message_id})
        return {"moment": _serialize_moment(document), "created": False}
    return {"moment": _serialize_moment(document), "created": True}


@router.patch("/moments/{moment_id}")
def update_moment(moment_id: str, payload: MomentUpdateRequest, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(moment_id)
    changes = payload.model_dump(exclude_none=True)
    if "note" in changes:
        changes["note"] = changes["note"].strip()
    changes["updated_at"] = utc_now()
    item = feature_collection("emora_moments").find_one_and_update({"_id": object_id, "user_id": current_user["_id"]}, {"$set": changes}, return_document=True) if object_id else None
    if not item:
        raise HTTPException(status_code=404, detail="Moment not found.")
    return {"moment": _serialize_moment(item)}


@router.delete("/moments/{moment_id}")
def delete_moment(moment_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(moment_id)
    if not object_id or not feature_collection("emora_moments").delete_one({"_id": object_id, "user_id": current_user["_id"]}).deleted_count:
        raise HTTPException(status_code=404, detail="Moment not found.")
    return {"message": "Moment deleted."}


@router.get("/taught-memories")
def list_taught_memories(current_user: dict = Depends(get_current_user)) -> dict:
    items = memories_collection().find({"user_id": current_user["_id"], "category": "taught"}).sort("updated_at", -1).limit(500)
    return {"memories": [_serialize_taught(item) for item in items], "limit": usage_limits_for_user(current_user)["taughtMemories"]}


@router.post("/taught-memories", status_code=201)
def teach_emora(payload: TaughtMemoryRequest, current_user: dict = Depends(get_current_user)) -> dict:
    collection = memories_collection()
    limit = usage_limits_for_user(current_user)["taughtMemories"]
    if collection.count_documents({"user_id": current_user["_id"], "category": "taught"}) >= limit:
        raise HTTPException(status_code=403, detail=f"Your current plan keeps up to {limit} things you teach Emora.")
    now = utc_now()
    value = " ".join(payload.value.split())
    key = "taught:" + hashlib.sha256(value.casefold().encode()).hexdigest()[:24]
    document = {"user_id": current_user["_id"], "category": "taught", "key": key, "label": payload.label.strip(), "value": value, "source": "explicit_user", "created_at": now, "updated_at": now}
    existing = collection.find_one({"user_id": current_user["_id"], "category": "taught", "key": key})
    if existing:
        return {"memory": _serialize_taught(existing), "created": False}
    try:
        result = collection.insert_one(document)
        document["_id"] = result.inserted_id
    except DuplicateKeyError:
        document = collection.find_one({"user_id": current_user["_id"], "category": "taught", "key": key})
        return {"memory": _serialize_taught(document), "created": False}
    return {"memory": _serialize_taught(document), "created": True}


@router.patch("/taught-memories/{memory_id}")
def edit_taught_memory(memory_id: str, payload: TaughtMemoryRequest, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(memory_id)
    item = memories_collection().find_one_and_update(
        {"_id": object_id, "user_id": current_user["_id"], "category": "taught"},
        {"$set": {"value": " ".join(payload.value.split()), "label": payload.label.strip(), "updated_at": utc_now()}},
        return_document=True,
    ) if object_id else None
    if not item:
        raise HTTPException(status_code=404, detail="Taught memory not found.")
    return {"memory": _serialize_taught(item)}


@router.delete("/taught-memories/{memory_id}")
def forget_taught_memory(memory_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(memory_id)
    if not object_id or not memories_collection().delete_one({"_id": object_id, "user_id": current_user["_id"], "category": "taught"}).deleted_count:
        raise HTTPException(status_code=404, detail="Taught memory not found.")
    return {"message": "Emora forgot that detail."}


def _daily_drop_for(user: dict) -> dict:
    today = utc_now().date().isoformat()
    collection = feature_collection("daily_drops")
    existing = collection.find_one({"user_id": user["_id"], "date": today})
    if existing:
        return existing
    plan = active_plan_for_user(user)
    subject = None
    source = "daily"
    if plan in {"plus", "pro", "complete"}:
        goal = feature_collection("goals").find_one({"user_id": user["_id"], "completed": False}, sort=[("created_at", -1)])
        if goal and str(goal.get("title", "")).strip():
            subject, source = str(goal["title"]).strip()[:100], "goal"
    if plan in {"pro", "complete"} and subject is None:
        memory = memories_collection().find_one({"user_id": user["_id"]}, sort=[("updated_at", -1)])
        if memory and str(memory.get("value", "")).strip():
            subject, source = str(memory["value"]).strip()[:100], "memory"
    seed = int(hashlib.sha256(f"{user['_id']}:{today}".encode()).hexdigest()[:8], 16)
    prompt = f"You chose to keep “{subject}” in view. What would gentle progress look like today?" if subject else DROP_PROMPTS[seed % len(DROP_PROMPTS)]
    document = {"user_id": user["_id"], "date": today, "kind": "question", "content": prompt, "source": source, "created_at": utc_now()}
    try:
        result = collection.insert_one(document)
        document["_id"] = result.inserted_id
    except DuplicateKeyError:
        document = collection.find_one({"user_id": user["_id"], "date": today})
    return document


@router.get("/daily-drop")
def daily_drop(current_user: dict = Depends(get_current_user)) -> dict:
    item = _daily_drop_for(current_user)
    return {"drop": {"id": str(item["_id"]), "date": item["date"], "kind": item["kind"], "content": item["content"], "personalized": item.get("source") != "daily"}}


@router.get("/weekly-story")
def weekly_story(period: str = Query(default="week", pattern="^(week|month)$"), current_user: dict = Depends(get_current_user)) -> dict:
    if period == "month" and not has_entitlement(current_user, "long_term_story"):
        raise HTTPException(status_code=403, detail="Monthly stories are included with Complete.")
    days = 30 if period == "month" else 7
    since = utc_now() - timedelta(days=days)
    messages = []
    conversation_count = 0
    for conversation in conversations_collection().find({"user_id": current_user["_id"], "updated_at": {"$gte": since}}, {"messages": 1}):
        conversation_count += 1
        messages.extend(item for item in conversation.get("messages", []) if item.get("role") == "user" and item.get("timestamp") and as_utc(item["timestamp"]) >= since)
    goals = list(feature_collection("goals").find({"user_id": current_user["_id"], "completed_at": {"$gte": since}}).limit(20))
    journals = list(feature_collection("journal_entries").find({"user_id": current_user["_id"], "created_at": {"$gte": since}}).limit(20))
    moments = list(feature_collection("emora_moments").find({"user_id": current_user["_id"], "created_at": {"$gte": since}}).limit(50))
    dashboard = dashboard_from_messages(messages, memories_collection().count_documents({"user_id": current_user["_id"]}))
    topics = list(dashboard.get("mostDiscussedTopics") or [])[:3]
    available = has_entitlement(current_user, "weekly_story")
    summary = "Your week is still beginning. A story will form only from moments you actually create."
    if messages or goals or journals or moments:
        pieces = [f"You returned to Emora across {conversation_count} conversation{'s' if conversation_count != 1 else ''}."]
        if topics:
            pieces.append(f"The threads you explored most were {', '.join(topics)}.")
        if goals:
            pieces.append(f"You completed {len(goals)} gentle goal{'s' if len(goals) != 1 else ''}.")
        summary = " ".join(pieces)
    return {"story": {"period": period, "available": available, "summary": summary, "topics": topics if available else topics[:1], "counts": {"conversations": conversation_count, "messages": len(messages), "journals": len(journals), "goals": len(goals), "moments": len(moments)}}}


def _node_id(kind: str, value) -> str:
    return f"{kind}:{value}"


@router.get("/constellation")
def constellation(current_user: dict = Depends(get_current_user)) -> dict:
    hidden = {item["node_id"] for item in feature_collection("constellation_hidden").find({"user_id": current_user["_id"]}, {"node_id": 1})}
    nodes = []
    for item in feature_collection("goals").find({"user_id": current_user["_id"]}).sort("created_at", -1).limit(20):
        nodes.append({"id": _node_id("goal", item["_id"]), "type": "goal", "label": str(item.get("title", "Goal"))[:80], "why": "A goal you chose to keep", "date": to_iso(item.get("created_at"))})
    for item in memories_collection().find({"user_id": current_user["_id"]}).sort("updated_at", -1).limit(20):
        nodes.append({"id": _node_id("memory", item["_id"]), "type": "memory", "label": str(item.get("value", "Memory"))[:80], "why": "A detail you allowed Emora to remember", "date": to_iso(item.get("updated_at"))})
    for item in feature_collection("emora_moments").find({"user_id": current_user["_id"]}).sort("created_at", -1).limit(20):
        nodes.append({"id": _node_id("moment", item["_id"]), "type": "moment", "label": str(item.get("quote", "Moment"))[:80], "why": "A conversation moment you saved", "date": to_iso(item.get("created_at"))})
    nodes = [item for item in nodes if item["id"] not in hidden]
    limit = usage_limits_for_user(current_user)["constellationNodes"]
    nodes = nodes[:limit]
    full = has_entitlement(current_user, "personal_constellation")
    edges = [{"from": "you", "to": item["id"]} for item in nodes] if full else []
    return {"constellation": {"available": full, "nodes": nodes, "edges": edges, "empty": not nodes, "historical": has_entitlement(current_user, "historical_constellation")}}


@router.delete("/constellation/{node_id:path}")
def hide_constellation_node(node_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    if not re.match(r"^(goal|memory|moment):[a-f0-9]{24}$", node_id):
        raise HTTPException(status_code=400, detail="Invalid constellation node.")
    feature_collection("constellation_hidden").update_one({"user_id": current_user["_id"], "node_id": node_id}, {"$setOnInsert": {"user_id": current_user["_id"], "node_id": node_id, "created_at": utc_now()}}, upsert=True)
    return {"message": "Node hidden from your constellation. The source item was not deleted."}


@router.get("/space")
def get_personal_space(current_user: dict = Depends(get_current_user)) -> dict:
    plan = active_plan_for_user(current_user)
    allowed = [name for name, required in ENVIRONMENTS.items() if ("free", "plus", "pro", "complete").index(required) <= ("free", "plus", "pro", "complete").index(plan)]
    document = feature_collection("user_spaces").find_one({"user_id": current_user["_id"]}) or {}
    selected = document.get("environment", "midnight")
    if selected not in allowed:
        selected = "midnight"
    return {"space": {"environment": selected, "available": allowed}}


@router.put("/space")
def update_personal_space(payload: EnvironmentRequest, current_user: dict = Depends(get_current_user)) -> dict:
    if payload.environment not in ENVIRONMENTS:
        raise HTTPException(status_code=400, detail="Unknown environment.")
    plan = active_plan_for_user(current_user)
    order = ("free", "plus", "pro", "complete")
    if order.index(ENVIRONMENTS[payload.environment]) > order.index(plan):
        raise HTTPException(status_code=403, detail=f"{payload.environment.replace('-', ' ').title()} is not included with your current plan.")
    feature_collection("user_spaces").update_one({"user_id": current_user["_id"]}, {"$set": {"environment": payload.environment, "updated_at": utc_now()}, "$setOnInsert": {"user_id": current_user["_id"]}}, upsert=True)
    return {"space": {"environment": payload.environment}}
