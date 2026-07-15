from __future__ import annotations

from datetime import timedelta
from secrets import token_urlsafe

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.database import conversations_collection, feature_collection, parse_object_id, utc_now
from app.rate_limit import rate_limit
from app.security import get_current_user
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
    minutes: int = Field(default=25, ge=5, le=120)


class JoinRoomRequest(BaseModel):
    code: str = Field(min_length=4, max_length=32)


class SpaceRequest(BaseModel):
    background: str = Field(default="forest", max_length=40)
    ambience: str = Field(default="none", max_length=40)
    accessory: str = Field(default="none", max_length=40)


class RemixRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    format: str = Field(pattern="^(plan|journal|quiz|tasks)$")


def _serialize_memory(item: dict) -> dict:
    return {"id": str(item["_id"]), "text": item["text"], "createdAt": item["created_at"].isoformat()}


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
def create_focus_room(payload: RoomRequest, current_user: dict = Depends(get_current_user)) -> dict:
    code = token_urlsafe(5).upper().replace("_", "").replace("-", "")
    now = utc_now()
    document = {"code": code, "name": payload.name.strip(), "minutes": payload.minutes, "owner_id": current_user["_id"], "members": [current_user["_id"]], "created_at": now, "ends_at": now + timedelta(minutes=payload.minutes)}
    feature_collection("focus_rooms").insert_one(document)
    return {"room": {"code": code, "name": document["name"], "minutes": payload.minutes, "members": 1, "endsAt": document["ends_at"].isoformat()}}


@router.post("/focus-rooms/join")
def join_focus_room(payload: JoinRoomRequest, current_user: dict = Depends(get_current_user)) -> dict:
    room = feature_collection("focus_rooms").find_one_and_update({"code": payload.code.upper(), "ends_at": {"$gt": utc_now()}}, {"$addToSet": {"members": current_user["_id"]}}, return_document=True)
    if not room:
        raise HTTPException(status_code=404, detail="Active focus room not found.")
    return {"room": {"code": room["code"], "name": room["name"], "minutes": room["minutes"], "members": len(room["members"]), "endsAt": room["ends_at"].isoformat()}}


@router.get("/space")
def get_space(current_user: dict = Depends(get_current_user)) -> dict:
    document = feature_collection("user_spaces").find_one({"user_id": current_user["_id"]}) or {"background": "forest", "ambience": "none", "accessory": "none"}
    return {"space": {key: document[key] for key in ("background", "ambience", "accessory")}}


@router.put("/space")
def update_space(payload: SpaceRequest, current_user: dict = Depends(get_current_user)) -> dict:
    space = payload.model_dump()
    feature_collection("user_spaces").update_one({"user_id": current_user["_id"]}, {"$set": {**space, "updated_at": utc_now()}, "$setOnInsert": {"user_id": current_user["_id"]}}, upsert=True)
    return {"space": space}


@router.post("/remix")
def remix(payload: RemixRequest, _: dict = Depends(get_current_user)) -> dict:
    text = " ".join(payload.text.split())
    sentences = [part.strip() for part in text.replace("!", ".").replace("?", ".").split(".") if part.strip()]
    core = sentences[:4] or [text]
    if payload.format == "journal":
        output = f"Today I explored: {text}\n\nWhat stood out: {core[0]}\n\nA gentle next step: {core[-1]}"
    elif payload.format == "quiz":
        output = "\n".join(f"{index + 1}. What does this mean to you: {sentence}?" for index, sentence in enumerate(core))
    elif payload.format == "tasks":
        output = "\n".join(f"- [ ] {sentence}" for sentence in core)
    else:
        output = "\n".join(["Plan", *[f"{index + 1}. {sentence}" for index, sentence in enumerate(core)], "\nFinish with one tiny next action."])
    return {"format": payload.format, "content": output}


@router.get("/postcard/{conversation_id}", dependencies=[Depends(rate_limit(8, 300, "voice-postcard"))])
async def voice_postcard(conversation_id: str, current_user: dict = Depends(get_current_user)) -> FileResponse:
    object_id = parse_object_id(conversation_id)
    conversation = conversations_collection().find_one({"_id": object_id, "user_id": current_user["_id"]}) if object_id else None
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    messages = [item.get("content", "") for item in conversation.get("messages", []) if item.get("role") == "assistant"]
    if not messages:
        raise HTTPException(status_code=400, detail="This conversation has no companion reply to turn into a postcard.")
    text = f"A note from Emora. {messages[-1][:900]}"
    path = await generate_audio(text=text, companion_id=conversation.get("character_id"))
    return FileResponse(path, media_type="audio/wav", filename="emora-postcard.wav", headers={"Cache-Control": "private, no-store"})
