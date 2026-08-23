from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.access import has_entitlement
from app.database import feature_collection, parse_object_id, utc_now
from app.preferences import get_user_preferences, update_user_preferences
from app.security import get_current_user


router = APIRouter(prefix="/api/personal", tags=["personal"])


class JournalRequest(BaseModel):
    title: str = Field(default="Untitled reflection", min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=6000)
    mood: str = Field(default="reflective", max_length=30)


class GoalRequest(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    note: str = Field(default="", max_length=500)


class ArrivalRequest(BaseModel):
    mood: str = Field(pattern="^(quiet|heavy|scattered|okay|energized|unsure|calm|hopeful|tired|anxious|low)$")
    energy: int | None = Field(default=None, ge=1, le=5)
    note: str | None = Field(default=None, max_length=280)
    tiny_thing: str | None = Field(default=None, max_length=160, alias="tinyThing")


class PreferencesRequest(BaseModel):
    emotionalMemory: bool | None = None
    visualInput: bool | None = None
    connectionReminders: bool | None = None
    weeklyReflection: bool | None = None
    streakReminders: bool | None = None
    quietHours: bool | None = None
    dataMinimisation: bool | None = None
    adaptiveContext: bool | None = None


def _serialize_journal(item: dict) -> dict:
    return {"id": str(item["_id"]), "title": item["title"], "content": item["content"], "mood": item["mood"], "createdAt": item["created_at"].isoformat(), "updatedAt": item.get("updated_at", item["created_at"]).isoformat()}


def _serialize_goal(item: dict) -> dict:
    return {"id": str(item["_id"]), "title": item["title"], "note": item["note"], "completed": bool(item.get("completed")), "isTinyThing": bool(item.get("is_tiny_thing")), "createdAt": item["created_at"].isoformat(), "completedAt": item.get("completed_at").isoformat() if item.get("completed_at") else None}


@router.get("/preferences")
def read_preferences(current_user: dict = Depends(get_current_user)) -> dict:
    return {"preferences": get_user_preferences(current_user["_id"])}


@router.patch("/preferences")
def save_preferences(payload: PreferencesRequest, current_user: dict = Depends(get_current_user)) -> dict:
    changes = payload.model_dump(exclude_none=True)
    if changes.get("adaptiveContext") is True and not has_entitlement(current_user, "adaptive_companion"):
        raise HTTPException(status_code=403, detail="Adaptive context is included with Pro.")
    return {"preferences": update_user_preferences(current_user["_id"], changes)}


def _serialize_arrival(item: dict) -> dict:
    return {
        "id": str(item["_id"]),
        "date": item["date"],
        "mood": item["mood"],
        "energy": item.get("energy"),
        "note": item.get("note", ""),
        "tinyThing": item.get("tiny_thing", ""),
        "createdAt": item["created_at"].isoformat(),
        "updatedAt": item["updated_at"].isoformat(),
    }


ARRIVAL_RESPONSES = {
    "quiet": "Quiet is welcome here. Nothing needs to be filled in.",
    "heavy": "That sounds like a lot to carry. We can keep today very small.",
    "scattered": "You do not have to gather every thread at once. One can be enough.",
    "okay": "Okay can be a steady place to begin. We can take the day as it comes.",
    "energized": "There is some energy here. Let us give it one kind direction.",
    "unsure": "Not knowing is a real answer. You can arrive before the words do.",
    "calm": "There is room to stay with that steadiness for a moment.",
    "hopeful": "That hope is worth noticing. We can protect it without rushing it.",
    "tired": "You do not have to perform energy here. A smaller day still counts.",
    "anxious": "We can slow this down together and stay with only the next moment.",
    "low": "I am here with you. We can keep this gentle and ask very little of today.",
}


@router.get("/check-ins")
def list_check_ins(
    limit: int = Query(default=30, ge=1, le=180),
    current_user: dict = Depends(get_current_user),
) -> dict:
    items = feature_collection("daily_check_ins").find({"user_id": current_user["_id"]}).sort("date", -1).limit(limit)
    return {"checkIns": [_serialize_arrival(item) for item in items]}


@router.post("/check-ins")
def save_check_in(payload: ArrivalRequest, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now()
    date = now.date().isoformat()
    collection = feature_collection("daily_check_ins")
    values = {
        "mood": payload.mood,
        "updated_at": now,
    }
    if payload.energy is not None:
        values["energy"] = payload.energy
    if payload.note is not None:
        values["note"] = payload.note.strip()
    if payload.tiny_thing is not None:
        values["tiny_thing"] = payload.tiny_thing.strip()
    collection.update_one(
        {"user_id": current_user["_id"], "date": date},
        {
            "$set": values,
            "$setOnInsert": {"user_id": current_user["_id"], "date": date, "created_at": now},
        },
        upsert=True,
    )
    return {
        "checkIn": _serialize_arrival(collection.find_one({"user_id": current_user["_id"], "date": date})),
        "companionResponse": ARRIVAL_RESPONSES[payload.mood],
    }


@router.get("/journal")
def list_journal(current_user: dict = Depends(get_current_user)) -> dict:
    entries = feature_collection("journal_entries").find({"user_id": current_user["_id"]}).sort("created_at", -1).limit(100)
    return {"entries": [_serialize_journal(item) for item in entries]}


@router.post("/journal", status_code=201)
def create_journal(payload: JournalRequest, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now()
    document = {"user_id": current_user["_id"], "title": payload.title.strip() or "Untitled reflection", "content": payload.content.strip(), "mood": payload.mood.strip() or "reflective", "created_at": now, "updated_at": now}
    result = feature_collection("journal_entries").insert_one(document)
    document["_id"] = result.inserted_id
    return {"entry": _serialize_journal(document)}


@router.patch("/journal/{entry_id}")
def update_journal(entry_id: str, payload: JournalRequest, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(entry_id)
    entry = feature_collection("journal_entries").find_one_and_update(
        {"_id": object_id, "user_id": current_user["_id"]},
        {"$set": {"title": payload.title.strip() or "Untitled reflection", "content": payload.content.strip(), "mood": payload.mood.strip() or "reflective", "updated_at": utc_now()}},
        return_document=True,
    ) if object_id else None
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    return {"entry": _serialize_journal(entry)}


@router.delete("/journal/{entry_id}")
def delete_journal(entry_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(entry_id)
    if not object_id or not feature_collection("journal_entries").delete_one({"_id": object_id, "user_id": current_user["_id"]}).deleted_count:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    return {"message": "Journal entry deleted."}


@router.get("/goals")
def list_goals(current_user: dict = Depends(get_current_user)) -> dict:
    goals = feature_collection("goals").find({"user_id": current_user["_id"]}).sort("created_at", -1).limit(100)
    return {"goals": [_serialize_goal(item) for item in goals]}


@router.post("/goals", status_code=201)
def create_goal(payload: GoalRequest, current_user: dict = Depends(get_current_user)) -> dict:
    document = {"user_id": current_user["_id"], "title": payload.title.strip(), "note": payload.note.strip(), "completed": False, "created_at": utc_now()}
    result = feature_collection("goals").insert_one(document)
    document["_id"] = result.inserted_id
    return {"goal": _serialize_goal(document)}


@router.patch("/goals/{goal_id}/complete")
def complete_goal(goal_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(goal_id)
    goal = feature_collection("goals").find_one_and_update({"_id": object_id, "user_id": current_user["_id"]}, {"$set": {"completed": True, "completed_at": utc_now(), "is_tiny_thing": False}}, return_document=True) if object_id else None
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return {"goal": _serialize_goal(goal)}


@router.patch("/goals/{goal_id}/reopen")
def reopen_goal(goal_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(goal_id)
    goal = feature_collection("goals").find_one_and_update(
        {"_id": object_id, "user_id": current_user["_id"]},
        {"$set": {"completed": False, "is_tiny_thing": False}, "$unset": {"completed_at": ""}},
        return_document=True,
    ) if object_id else None
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return {"goal": _serialize_goal(goal)}


@router.patch("/goals/{goal_id}/tiny-thing")
def choose_tiny_thing(goal_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(goal_id)
    collection = feature_collection("goals")
    goal = collection.find_one({"_id": object_id, "user_id": current_user["_id"], "completed": False}) if object_id else None
    if not goal:
        raise HTTPException(status_code=404, detail="Active goal not found.")
    collection.update_many({"user_id": current_user["_id"]}, {"$set": {"is_tiny_thing": False}})
    goal = collection.find_one_and_update(
        {"_id": object_id, "user_id": current_user["_id"]},
        {"$set": {"is_tiny_thing": True, "tiny_thing_at": utc_now()}},
        return_document=True,
    )
    return {"goal": _serialize_goal(goal)}


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(goal_id)
    if not object_id or not feature_collection("goals").delete_one({"_id": object_id, "user_id": current_user["_id"]}).deleted_count:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return {"message": "Goal deleted."}
