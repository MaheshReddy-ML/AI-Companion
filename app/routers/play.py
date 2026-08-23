from __future__ import annotations

import asyncio
from collections import Counter
from datetime import date, timedelta
import json
import re
from secrets import token_urlsafe
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.access import has_entitlement, usage_limits_for_user
from app.database import conversations_collection, feature_collection, parse_object_id, to_iso, utc_now
from app.rate_limit import rate_limit
from app.security import get_current_user, require_entitlement
from app.services.companion_chat import get_companion_reply
from app.voice_manager import get_manager
from app.tts_queue import generate_audio


router = APIRouter(prefix="/api/play", tags=["play"])

QUESTS = [
    {"id": "focus-sprint", "title": "Focus sprint", "description": "Spend 10 distraction-free minutes on one meaningful task."},
    {"id": "gratitude-hunt", "title": "Gratitude hunt", "description": "Notice and write down three small things that helped today."},
    {"id": "build-challenge", "title": "Build challenge", "description": "Take one small step toward an idea you want to make real."},
]


class MemoryRequest(BaseModel):
    text: str = Field(min_length=2, max_length=300)


class RoomRequest(BaseModel):
    name: str = Field(default="Focus room", min_length=2, max_length=60)
    minutes: int | None = Field(default=25, ge=5, le=120)
    unlimited: bool = False
    connection_id: str | None = Field(default=None, min_length=8, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")


class JoinRoomRequest(BaseModel):
    code: str = Field(min_length=4, max_length=32)
    connection_id: str | None = Field(default=None, min_length=8, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")


class FocusMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class FocusPresenceRequest(BaseModel):
    connection_id: str = Field(min_length=8, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")


class SpaceRequest(BaseModel):
    background: Literal["forest", "garden", "room", "observatory", "coast", "library"] = "forest"
    ambience: Literal["none", "rain", "lofi", "fireplace", "night_wind", "ocean"] = "none"
    accessory: Literal["none", "plant", "lamp", "candles", "telescope", "books"] = "none"


class RemixRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    format: str = Field(pattern="^(plan|journal|quiz|tasks|pattern|letter|questions|gentle_goal|focus_session)$")


def _remix_content(text: str, format: str) -> str:
    normalized = " ".join(text.split())
    sentences = [part.strip() for part in re.split(r"[.!?]+", normalized) if part.strip()]
    core = sentences[:4] or [normalized]
    if format == "journal":
        return f"Today I explored: {normalized}\n\nWhat stood out: {core[0]}\n\nA gentle next step: {core[-1]}"
    if format == "quiz":
        return "\n".join(f"{index + 1}. What does this mean to you: {sentence}?" for index, sentence in enumerate(core))
    if format == "tasks":
        return "\n".join(f"- [ ] {sentence}" for sentence in core)
    if format == "pattern":
        stop_words = {"about", "after", "again", "also", "because", "been", "could", "from", "have", "into", "just", "more", "that", "their", "there", "these", "they", "this", "want", "what", "when", "with", "would", "your"}
        words = re.findall(r"[a-zA-Z']{4,}", normalized.lower())
        themes = [word for word, _ in Counter(word for word in words if word not in stop_words).most_common(3)]
        theme_text = ", ".join(themes) if themes else "No repeated theme is clear yet"
        return f"PATTERN NOTE\n\nThreads that repeat: {theme_text}.\n\nThe clearest statement: {core[0]}.\n\nWorth noticing next: When does this feel lighter, heavier, or different?"
    if format == "letter":
        return f"What I could not quite say\n\nI have been carrying this: {normalized}\n\nWhat I need you to understand is: {core[0]}.\n\nI am not asking for a perfect answer. I am asking for room to be honest."
    if format == "questions":
        return "\n".join([
            f"1. Which part of this feels most important right now: {core[0]}?",
            "2. What are you assuming that may not be fully known yet?",
            "3. What would make this ten percent easier?",
            "4. What do you want to protect while you move forward?",
            "5. What is one honest next question you can ask?",
        ])
    if format == "gentle_goal":
        return f"GENTLE GOAL\n\nDirection: {core[0]}\n\nOne tiny thing: Spend ten pressure-free minutes on the smallest visible part.\n\nEnough for today: Stop after that step unless continuing feels genuinely useful."
    if format == "focus_session":
        return f"25-MINUTE FOCUS SESSION\n\n0–3 min · Settle: write the smallest outcome for {core[0]}.\n3–20 min · Focus: work only on that outcome.\n20–23 min · Close loops: save or note where to resume.\n23–25 min · Reflect: name one thing that moved."
    return "\n".join(["Plan", *[f"{index + 1}. {sentence}" for index, sentence in enumerate(core)], "\nFinish with one tiny next action."])


def _serialize_memory(item: dict) -> dict:
    return {"id": str(item["_id"]), "text": item["text"], "createdAt": item["created_at"].isoformat()}


def _focus_message_id() -> str:
    return token_urlsafe(9).replace("_", "").replace("-", "")


FOCUS_ACTIVE = "ACTIVE"
FOCUS_ENDED = "ENDED"
FOCUS_PRESENCE_SECONDS = 35
FOCUS_RETENTION_HOURS = 24


def _focus_display_name(user: dict) -> str:
    name = str(user.get("name") or "").strip()
    if name:
        return name[:80]
    email = str(user.get("email") or "").strip()
    return (email.split("@", 1)[0] if email else "Member")[:80]


def _focus_active_query(now) -> dict:
    return {
        "status": {"$in": [FOCUS_ACTIVE, None]},
        "$or": [{"ends_at": None}, {"ends_at": {"$gt": now}}],
    }


def _touch_focus_presence(room: dict, user: dict, connection_id: str | None) -> None:
    if not connection_id or room.get("status", FOCUS_ACTIVE) != FOCUS_ACTIVE:
        return
    now = utc_now()
    feature_collection("focus_room_presence").update_one(
        {"room_id": room["_id"], "user_id": user["_id"], "connection_id": connection_id},
        {
            "$set": {
                "room_code": room["code"],
                "display_name": _focus_display_name(user),
                "last_seen_at": now,
                "expires_at": now + timedelta(seconds=FOCUS_PRESENCE_SECONDS * 2),
            },
            "$setOnInsert": {"joined_at": now},
        },
        upsert=True,
    )


def _leave_focus_presence(room_id, user_id, connection_id: str) -> None:
    feature_collection("focus_room_presence").delete_one(
        {"room_id": room_id, "user_id": user_id, "connection_id": connection_id}
    )


def _focus_participants(room: dict, current_user_id, now=None) -> list[dict]:
    if room.get("status", FOCUS_ACTIVE) == FOCUS_ENDED and room.get("final_participants") is not None:
        items = room.get("final_participants", [])
    else:
        cutoff = (now or utc_now()) - timedelta(seconds=FOCUS_PRESENCE_SECONDS)
        items = list(feature_collection("focus_room_presence").find(
            {"room_id": room["_id"], "last_seen_at": {"$gt": cutoff}},
            sort=[("joined_at", 1)],
        ))

    seen = set()
    participants = []
    for item in items:
        user_id = item.get("user_id")
        key = str(user_id)
        if not user_id or key in seen:
            continue
        seen.add(key)
        participants.append({
            "name": str(item.get("display_name") or "Member"),
            "mine": user_id == current_user_id,
        })
    return participants


def _final_focus_participants(room: dict, now=None) -> list[dict]:
    cutoff = (now or utc_now()) - timedelta(seconds=FOCUS_PRESENCE_SECONDS)
    records = list(feature_collection("focus_room_presence").find(
        {"room_id": room["_id"], "last_seen_at": {"$gt": cutoff}},
        sort=[("joined_at", 1)],
    ))
    seen = set()
    result = []
    for item in records:
        key = str(item.get("user_id"))
        if not item.get("user_id") or key in seen:
            continue
        seen.add(key)
        result.append({"user_id": item["user_id"], "display_name": str(item.get("display_name") or "Member")})
    return result


def _serialize_focus_message(message: dict, current_user_id) -> dict:
    sender_type = message.get("sender_type") or ("EMORA" if message.get("role") == "assistant" else "USER")
    is_assistant = sender_type == "EMORA"
    mine = not is_assistant and message.get("author_id") == current_user_id
    return {
        "id": str(message.get("id", "")),
        "role": "assistant" if is_assistant else "user",
        "senderType": sender_type,
        "sender": "Emora" if is_assistant else "You" if mine else str(message.get("sender_name") or "Member"),
        "content": str(message.get("content", "")),
        "createdAt": to_iso(message.get("created_at")),
        "mine": mine,
    }


def _serialize_focus_room(room: dict, current_user_id, participants: list[dict] | None = None) -> dict:
    status = room.get("status", FOCUS_ACTIVE)
    participants = participants if participants is not None else []
    ends_at = room.get("ends_at")
    return {
        "code": room["code"],
        "name": room["name"],
        "minutes": room.get("minutes"),
        "durationMinutes": room.get("minutes"),
        "unlimited": ends_at is None,
        "status": status,
        "createdAt": to_iso(room.get("created_at")),
        "endsAt": to_iso(ends_at),
        "endedAt": to_iso(room.get("ended_at")),
        "serverNow": to_iso(utc_now()),
        "members": len(participants),
        "participants": participants,
        "isHost": room.get("owner_id") == current_user_id,
        "replyPending": status == FOCUS_ACTIVE and bool(room.get("reply_in_progress")),
        "revision": int(room.get("revision", 0)),
        "messages": [_serialize_focus_message(message, current_user_id) for message in room.get("messages", [])],
        "reflection": room.get("reflection"),
    }


def _serialize_focus_room_with_presence(room: dict, current_user_id) -> dict:
    return _serialize_focus_room(room, current_user_id, _focus_participants(room, current_user_id))


def _transition_expired_focus_rooms(collection, now=None) -> None:
    now = now or utc_now()
    expired = list(collection.find({"status": {"$in": [FOCUS_ACTIVE, None]}, "ends_at": {"$lte": now}}))
    for room in expired:
        final_participants = _final_focus_participants(room, now)
        collection.update_one(
            {"_id": room["_id"], "status": {"$in": [FOCUS_ACTIVE, None]}, "ends_at": {"$lte": now}},
            {
                "$set": {
                    "status": FOCUS_ENDED,
                    "ended_at": now,
                    "ended_reason": "expired",
                    "messages": [],
                    "message_count": 0,
                    "reply_in_progress": False,
                    "final_participants": final_participants,
                    "delete_at": now + timedelta(hours=FOCUS_RETENTION_HOURS),
                },
                "$unset": {"reply_started_at": ""},
                "$inc": {"revision": 1},
            },
        )


def _focus_room_for_member(code: str, current_user: dict, *, active_only: bool = False) -> dict:
    collection = feature_collection("focus_rooms")
    now = utc_now()
    _transition_expired_focus_rooms(collection, now)
    query = {"code": code.strip().upper(), "members": current_user["_id"]}
    if active_only:
        query.update(_focus_active_query(now))
    room = collection.find_one(query)
    if not room:
        raise HTTPException(status_code=404, detail="Focus room not found or you are not a member.")
    return room


@router.get("/quests")
def get_quests(current_user: dict = Depends(get_current_user)) -> dict:
    date = utc_now().date().isoformat()
    collection = feature_collection("quests")
    document = collection.find_one_and_update(
        {"user_id": current_user["_id"], "date": date},
        {"$setOnInsert": {"user_id": current_user["_id"], "date": date, "quests": [{**quest, "completed": False} for quest in QUESTS]}},
        upsert=True,
        return_document=True,
    )
    return {"date": date, "quests": document["quests"]}


@router.post("/quests/{quest_id}/complete")
def complete_quest(quest_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    date = utc_now().date().isoformat()
    result = feature_collection("quests").update_one(
        {"user_id": current_user["_id"], "date": date, "quests.id": quest_id},
        {"$set": {"quests.$.completed": True}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Today's quest was not found.")
    completed = feature_collection("quests").find_one({"user_id": current_user["_id"], "date": date})["quests"]
    count = sum(1 for item in completed if item.get("completed"))
    return {"message": "Quest completed — your garden grew.", "completed": count}


@router.get("/garden")
def get_garden(current_user: dict = Depends(get_current_user)) -> dict:
    completed = sum(sum(1 for quest in item.get("quests", []) if quest.get("completed")) for item in feature_collection("quests").find({"user_id": current_user["_id"]}))
    stage = "seed" if completed == 0 else "sprout" if completed < 4 else "bloom" if completed < 12 else "grove"
    return {"stage": stage, "completedQuests": completed, "message": "Your private garden grows through completed quests, never public comparison."}


@router.get("/ritual-history")
def ritual_history(current_user: dict = Depends(require_entitlement("look_back"))) -> dict:
    items = list(feature_collection("quests").find({"user_id": current_user["_id"]}).sort("date", -1).limit(30))
    completed_by_ritual: Counter[str] = Counter()
    active_dates: list[str] = []
    recent: list[dict] = []
    for item in items:
        completed = [quest for quest in item.get("quests", []) if quest.get("completed")]
        if completed:
            active_dates.append(str(item.get("date", "")))
        for quest in completed:
            completed_by_ritual[str(quest.get("title", "Ritual"))] += 1
        if completed and len(recent) < 8:
            recent.append({"date": item.get("date"), "rituals": [str(quest.get("title", "Ritual")) for quest in completed]})
    streak = 0
    expected = utc_now().date()
    for value in active_dates:
        try:
            item_date = date.fromisoformat(value)
        except ValueError:
            continue
        if item_date == expected:
            streak += 1
            expected -= timedelta(days=1)
        elif item_date < expected:
            break
    strongest = completed_by_ritual.most_common(1)[0][0] if completed_by_ritual else None
    return {"activeDays": len(active_dates), "completedRituals": sum(completed_by_ritual.values()), "currentStreak": streak, "strongestRitual": strongest, "recent": recent}


@router.get("/memories")
def list_memories(current_user: dict = Depends(get_current_user)) -> dict:
    memories = feature_collection("memories").find({"user_id": current_user["_id"]}).sort("created_at", -1).limit(50)
    return {"memories": [_serialize_memory(item) for item in memories]}


@router.post("/memories", status_code=201)
def save_memory(payload: MemoryRequest, current_user: dict = Depends(get_current_user)) -> dict:
    document = {"user_id": current_user["_id"], "text": payload.text.strip(), "created_at": utc_now()}
    result = feature_collection("memories").insert_one(document)
    document["_id"] = result.inserted_id
    return {"memory": _serialize_memory(document)}


@router.delete("/memories/{memory_id}")
def delete_memory(memory_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(memory_id)
    if not object_id or not feature_collection("memories").delete_one({"_id": object_id, "user_id": current_user["_id"]}).deleted_count:
        raise HTTPException(status_code=404, detail="Memory not found.")
    return {"message": "Memory removed."}


@router.post("/focus-rooms", status_code=201)
def create_focus_room(payload: RoomRequest, current_user: dict = Depends(require_entitlement("focus_rooms"))) -> dict:
    now = utc_now()
    minutes = None if payload.unlimited else payload.minutes
    if not payload.unlimited and minutes is None:
        raise HTTPException(status_code=422, detail="Choose a duration or select Unlimited.")
    document = {
        "name": payload.name.strip(),
        "minutes": minutes,
        "owner_id": current_user["_id"],
        "members": [current_user["_id"]],
        "messages": [],
        "message_count": 0,
        "reply_in_progress": False,
        "status": FOCUS_ACTIVE,
        "revision": 1,
        "created_at": now,
        "last_activity_at": now,
        "ends_at": None if minutes is None else now + timedelta(minutes=minutes),
    }
    collection = feature_collection("focus_rooms")
    for _ in range(5):
        document["code"] = token_urlsafe(5).upper().replace("_", "").replace("-", "")
        try:
            result = collection.insert_one(document)
            break
        except DuplicateKeyError:
            document.pop("_id", None)
            continue
    else:
        raise HTTPException(status_code=503, detail="Could not allocate a private room code. Please try again.")
    document["_id"] = result.inserted_id
    _touch_focus_presence(document, current_user, payload.connection_id)
    return {"room": _serialize_focus_room_with_presence(document, current_user["_id"])}


@router.post("/focus-rooms/join")
def join_focus_room(payload: JoinRoomRequest, current_user: dict = Depends(require_entitlement("focus_rooms"))) -> dict:
    collection = feature_collection("focus_rooms")
    now = utc_now()
    _transition_expired_focus_rooms(collection, now)
    room = collection.find_one_and_update(
        {"code": payload.code.strip().upper(), **_focus_active_query(now)},
        {
            "$addToSet": {"members": current_user["_id"]},
            "$set": {"last_activity_at": now},
            "$inc": {"revision": 1},
        },
        return_document=ReturnDocument.AFTER,
    )
    if not room:
        raise HTTPException(status_code=404, detail="Active focus room not found.")
    _touch_focus_presence(room, current_user, payload.connection_id)
    return {"room": _serialize_focus_room_with_presence(room, current_user["_id"])}


@router.get("/focus-rooms/current")
def current_focus_room(
    current_user: dict = Depends(require_entitlement("focus_rooms")),
    connection_id: str | None = None,
) -> dict:
    collection = feature_collection("focus_rooms")
    now = utc_now()
    _transition_expired_focus_rooms(collection, now)
    room = collection.find_one(
        {"members": current_user["_id"], **_focus_active_query(now)},
        sort=[("last_activity_at", -1)],
    )
    if room:
        _touch_focus_presence(room, current_user, connection_id)
    return {"room": _serialize_focus_room_with_presence(room, current_user["_id"]) if room else None}


@router.get("/focus-rooms/{code}")
def get_focus_room(code: str, current_user: dict = Depends(require_entitlement("focus_rooms"))) -> dict:
    room = _focus_room_for_member(code, current_user)
    return {"room": _serialize_focus_room_with_presence(room, current_user["_id"])}


@router.get("/focus-rooms/{code}/events")
async def focus_room_events(
    code: str,
    request: Request,
    connection_id: str = Query(min_length=8, max_length=80, pattern=r"^[A-Za-z0-9_-]+$"),
    current_user: dict = Depends(require_entitlement("focus_rooms")),
) -> StreamingResponse:
    room = _focus_room_for_member(code, current_user)
    _touch_focus_presence(room, current_user, connection_id)

    async def event_stream():
        last_signature = None
        last_touch = 0.0
        last_keepalive = 0.0
        loop = asyncio.get_running_loop()
        while not await request.is_disconnected():
            current = await asyncio.to_thread(_focus_room_for_member, code, current_user)
            if loop.time() - last_touch >= 10 and current.get("status", FOCUS_ACTIVE) == FOCUS_ACTIVE:
                await asyncio.to_thread(_touch_focus_presence, current, current_user, connection_id)
                last_touch = loop.time()
            payload = await asyncio.to_thread(_serialize_focus_room_with_presence, current, current_user["_id"])
            signature = json.dumps({
                "revision": payload["revision"],
                "status": payload["status"],
                "replyPending": payload["replyPending"],
                "messages": [message["id"] for message in payload["messages"]],
                "participants": [item["name"] for item in payload["participants"]],
            }, sort_keys=True)
            if signature != last_signature:
                yield f"event: room\ndata: {json.dumps({'room': payload}, separators=(',', ':'))}\n\n"
                last_signature = signature
                last_keepalive = loop.time()
            elif loop.time() - last_keepalive >= 15:
                yield ": keep-alive\n\n"
                last_keepalive = loop.time()
            if payload["status"] == FOCUS_ENDED:
                break
            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.post("/focus-rooms/{code}/leave", status_code=204)
def leave_focus_room(
    code: str,
    payload: FocusPresenceRequest,
    current_user: dict = Depends(require_entitlement("focus_rooms")),
) -> None:
    room = _focus_room_for_member(code, current_user)
    _leave_focus_presence(room["_id"], current_user["_id"], payload.connection_id)


@router.post("/focus-rooms/{code}/end")
def end_focus_room(code: str, current_user: dict = Depends(require_entitlement("focus_rooms"))) -> dict:
    collection = feature_collection("focus_rooms")
    now = utc_now()
    _transition_expired_focus_rooms(collection, now)
    existing = collection.find_one({"code": code.strip().upper(), "members": current_user["_id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Focus room not found or you are not a member.")
    if existing.get("owner_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the room host can end this session.")
    if existing.get("status", FOCUS_ACTIVE) == FOCUS_ENDED:
        return {"room": _serialize_focus_room_with_presence(existing, current_user["_id"])}
    final_participants = _final_focus_participants(existing, now)
    room = collection.find_one_and_update(
        {"_id": existing["_id"], "owner_id": current_user["_id"], "status": {"$in": [FOCUS_ACTIVE, None]}},
        {
            "$set": {
                "status": FOCUS_ENDED,
                "ended_at": now,
                "ended_reason": "host",
                "messages": [],
                "message_count": 0,
                "reply_in_progress": False,
                "final_participants": final_participants,
                "delete_at": now + timedelta(hours=FOCUS_RETENTION_HOURS),
            },
            "$unset": {"reply_started_at": ""},
            "$inc": {"revision": 1},
        },
        return_document=ReturnDocument.AFTER,
    )
    if not room:
        room = collection.find_one({"_id": existing["_id"]})
    return {"room": _serialize_focus_room_with_presence(room, current_user["_id"])}


@router.post("/focus-rooms/{code}/messages", dependencies=[Depends(rate_limit(30, 300, "focus-room-chat"))])
async def send_focus_room_message(
    code: str,
    payload: FocusMessageRequest,
    current_user: dict = Depends(require_entitlement("focus_rooms")),
) -> dict:
    collection = feature_collection("focus_rooms")
    now = utc_now()
    _transition_expired_focus_rooms(collection, now)
    text = payload.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is required.")
    limits = usage_limits_for_user(current_user)
    if len(text) > limits["chatMessageCharacters"]:
        raise HTTPException(status_code=403, detail="This message is longer than your plan allows.")

    invokes_emora = bool(re.search(r"(?:^|\s)@emora\b", text, flags=re.IGNORECASE))
    stale_reply = now - timedelta(minutes=2)
    user_message = {
        "id": _focus_message_id(),
        "role": "user",
        "sender_type": "USER",
        "sender_name": _focus_display_name(current_user),
        "content": text,
        "author_id": current_user["_id"],
        "created_at": now,
        "metadata": {"mentions_emora": invokes_emora},
    }
    active_query = _focus_active_query(now)
    query = {
        "code": code.strip().upper(),
        "members": current_user["_id"],
        **active_query,
        "$and": [{"$or": [{"message_count": {"$lt": 240}}, {"message_count": {"$exists": False}}]}],
    }
    if invokes_emora:
        query["$and"].append({"$or": [
            {"reply_in_progress": {"$ne": True}},
            {"reply_started_at": {"$lt": stale_reply}},
        ]})
    update = {
        "$push": {"messages": user_message},
        "$inc": {"message_count": 1, "revision": 1},
        "$set": {"last_activity_at": now},
    }
    if invokes_emora:
        update["$set"].update({"reply_in_progress": True, "reply_started_at": now})
    room = collection.find_one_and_update(
        query,
        update,
        return_document=ReturnDocument.AFTER,
    )
    if not room:
        existing = collection.find_one({"code": code.strip().upper(), "members": current_user["_id"], **active_query})
        if existing and existing.get("message_count", 0) >= 240:
            raise HTTPException(status_code=429, detail="This room has reached its temporary message limit.")
        if existing and invokes_emora:
            raise HTTPException(status_code=409, detail="Emora is replying to another member. Try again in a moment.")
        if collection.find_one({"code": code.strip().upper(), "members": current_user["_id"], "status": FOCUS_ENDED}):
            raise HTTPException(status_code=410, detail="This focus room has ended.")
        raise HTTPException(status_code=404, detail="Active focus room not found or you are not a member.")

    if not invokes_emora:
        return {"room": _serialize_focus_room_with_presence(room, current_user["_id"])}

    history = [
        {
            "role": message.get("role", "user"),
            "content": message.get("content", ""),
        }
        for message in room.get("messages", [])[:-1]
        if message.get("content")
    ]
    room_context = (
        "You are Emora speaking inside a temporary shared Focus Together room. "
        f"The shared intention is: {room['name']}. Address the group naturally and use only names visible in the shared "
        "messages. Help members discuss, clarify, or make gentle progress together. Keep replies concise and suitable "
        "for everyone in the room. The entire chat disappears when the session ends."
    )
    try:
        assistant_text, _, model = await get_companion_reply(
            message=f"A room member says: {text}",
            history=history,
            persona_prompt=room_context,
            history_limit=limits["chatHistoryMessages"],
            priority=has_entitlement(current_user, "priority_generation"),
            requester_id=f"focus-room:{room['code']}",
            requester_limit=1,
        )
    except ValueError as exc:
        collection.update_one(
            {"_id": room["_id"]},
            {"$set": {"reply_in_progress": False}, "$unset": {"reply_started_at": ""}},
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    assistant_message = {
        "id": _focus_message_id(),
        "role": "assistant",
        "sender_type": "EMORA",
        "sender_name": "Emora",
        "content": assistant_text,
        "created_at": utc_now(),
        "model": model,
    }
    reply_now = utc_now()
    updated = collection.find_one_and_update(
        {"_id": room["_id"], **_focus_active_query(reply_now)},
        {
            "$push": {"messages": assistant_message},
            "$inc": {"message_count": 1, "revision": 1},
            "$set": {"reply_in_progress": False, "last_activity_at": reply_now},
            "$unset": {"reply_started_at": ""},
        },
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        collection.update_one(
            {"_id": room["_id"]},
            {"$set": {"reply_in_progress": False}, "$unset": {"reply_started_at": ""}},
        )
        raise HTTPException(status_code=410, detail="This focus room ended before Emora could reply.")
    return {"room": _serialize_focus_room_with_presence(updated, current_user["_id"])}


@router.post("/focus-rooms/{code}/reflection", dependencies=[Depends(rate_limit(5, 300, "focus-room-reflection"))])
async def reflect_on_focus_room(
    code: str,
    current_user: dict = Depends(require_entitlement("session_reflection")),
) -> dict:
    collection = feature_collection("focus_rooms")
    now = utc_now()
    _transition_expired_focus_rooms(collection, now)
    room = collection.find_one({"code": code.strip().upper(), "members": current_user["_id"], **_focus_active_query(now)})
    if not room:
        raise HTTPException(status_code=404, detail="Active focus room not found or you are not a member.")
    history = [
        {"role": message.get("role", "user"), "content": str(message.get("content") or "")}
        for message in room.get("messages", [])
        if str(message.get("content") or "").strip()
    ]
    if not any(item["role"] == "user" for item in history):
        raise HTTPException(status_code=409, detail="The room needs at least one shared message before Emora can reflect it.")
    created_at = room.get("created_at") or now
    elapsed_minutes = max(1, round((now - created_at).total_seconds() / 60))
    limits = usage_limits_for_user(current_user)
    try:
        reflection, _brain, _model = await get_companion_reply(
            message="Give this focus room its optional closing reflection.",
            history=history,
            persona_prompt=(
                "You are Emora closing a shared Focus Together session. Use only the room transcript. "
                "In 2 or 3 concise sentences, name what the group actually worked on, visible progress or a concrete unresolved thread, "
                "and one gentle next step. Do not invent completion, emotion, or participation."
            ),
            companion_context=f"Room intention: {room['name']}. Elapsed time: {elapsed_minutes} minutes.",
            history_limit=max(24, limits["chatHistoryMessages"]),
            priority=has_entitlement(current_user, "priority_generation"),
            requester_id=f"focus-reflection:{room['code']}",
            requester_limit=1,
        )
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    saved = {
        "text": reflection,
        "elapsedMinutes": elapsed_minutes,
        "createdAt": to_iso(now),
        "requestedBy": _focus_display_name(current_user),
    }
    updated = collection.find_one_and_update(
        {"_id": room["_id"], **_focus_active_query(now)},
        {"$set": {"reflection": saved, "last_activity_at": now}, "$inc": {"revision": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=410, detail="This focus room ended before the reflection was ready.")
    return {"room": _serialize_focus_room_with_presence(updated, current_user["_id"]), "reflection": saved}


@router.get("/space")
def get_space(current_user: dict = Depends(get_current_user)) -> dict:
    document = feature_collection("user_spaces").find_one({"user_id": current_user["_id"]}) or {"background": "forest", "ambience": "none", "accessory": "none"}
    return {"space": {key: document[key] for key in ("background", "ambience", "accessory")}}


@router.put("/space")
def update_space(payload: SpaceRequest, current_user: dict = Depends(require_entitlement("ambient_rooms"))) -> dict:
    space = payload.model_dump()
    feature_collection("user_spaces").update_one({"user_id": current_user["_id"]}, {"$set": {**space, "updated_at": utc_now()}, "$setOnInsert": {"user_id": current_user["_id"]}}, upsert=True)
    return {"space": space}


@router.post("/remix")
def remix(payload: RemixRequest, current_user: dict = Depends(require_entitlement("conversation_remix"))) -> dict:
    text = " ".join(payload.text.split())
    output = _remix_content(text, payload.format)
    created_goal = None
    if payload.format == "gentle_goal":
        title = re.split(r"[.!?]+", text)[0].strip()[:160] or "A gentle next step"
        document = {"user_id": current_user["_id"], "title": title, "note": "Created from Conversation Remix", "completed": False, "created_at": utc_now()}
        result = feature_collection("goals").insert_one(document)
        created_goal = {"id": str(result.inserted_id), "title": title}
    return {"format": payload.format, "content": output, "createdGoal": created_goal}


@router.get("/postcard/{conversation_id}", dependencies=[Depends(rate_limit(8, 300, "voice-postcard"))])
async def voice_postcard(conversation_id: str, current_user: dict = Depends(require_entitlement("voice_postcards"))) -> FileResponse:
    object_id = parse_object_id(conversation_id)
    conversation = conversations_collection().find_one({"_id": object_id, "user_id": current_user["_id"]}) if object_id else None
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    messages = [item.get("content", "") for item in conversation.get("messages", []) if item.get("role") == "assistant"]
    if not messages:
        raise HTTPException(status_code=400, detail="This conversation has no companion reply to turn into a postcard.")
    text = f"A note from Emora. {messages[-1][:900]}"
    path = await generate_audio(
        text=text,
        companion_id=conversation.get("character_id"),
        requester_id=str(current_user["_id"]),
        requester_limit=4,
        priority=True,
    )
    return FileResponse(path, media_type="audio/wav", filename="emora-postcard.wav", headers={"Cache-Control": "private, no-store"})
