from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database import feature_collection, parse_object_id, utc_now
from app.security import get_current_user


router = APIRouter(prefix="/api/personal", tags=["personal"])


class JournalRequest(BaseModel):
    title: str = Field(default="Untitled reflection", min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=6000)
    mood: str = Field(default="reflective", max_length=30)


class GoalRequest(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    note: str = Field(default="", max_length=500)


def _serialize_journal(item: dict) -> dict:
    return {"id": str(item["_id"]), "title": item["title"], "content": item["content"], "mood": item["mood"], "createdAt": item["created_at"].isoformat()}


def _serialize_goal(item: dict) -> dict:
    return {"id": str(item["_id"]), "title": item["title"], "note": item["note"], "completed": bool(item.get("completed")), "createdAt": item["created_at"].isoformat()}


@router.get("/journal")
def list_journal(current_user: dict = Depends(get_current_user)) -> dict:
    entries = feature_collection("journal_entries").find({"user_id": current_user["_id"]}).sort("created_at", -1).limit(100)
    return {"entries": [_serialize_journal(item) for item in entries]}


@router.post("/journal", status_code=201)
def create_journal(payload: JournalRequest, current_user: dict = Depends(get_current_user)) -> dict:
    document = {"user_id": current_user["_id"], "title": payload.title.strip() or "Untitled reflection", "content": payload.content.strip(), "mood": payload.mood.strip() or "reflective", "created_at": utc_now()}
    result = feature_collection("journal_entries").insert_one(document)
    document["_id"] = result.inserted_id
    return {"entry": _serialize_journal(document)}


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
    goal = feature_collection("goals").find_one_and_update({"_id": object_id, "user_id": current_user["_id"]}, {"$set": {"completed": True, "completed_at": utc_now()}}, return_document=True) if object_id else None
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return {"goal": _serialize_goal(goal)}


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(goal_id)
    if not object_id or not feature_collection("goals").delete_one({"_id": object_id, "user_id": current_user["_id"]}).deleted_count:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return {"message": "Goal deleted."}
