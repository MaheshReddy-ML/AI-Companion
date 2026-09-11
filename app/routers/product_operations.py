from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database import feature_collection, to_iso, utc_now
from app.preferences import get_user_preferences
from app.product_operations import ALLOWED_PRODUCT_EVENTS, feature_flags, record_product_event
from app.security import get_current_user


router = APIRouter(prefix="/api/product", tags=["product"])
ONBOARDING_GOALS = {"talk", "reflect", "goal", "focus", "research", "meet_emora"}


class OnboardingUpdate(BaseModel):
    status: str = Field(pattern="^(not_started|in_progress|completed|skipped)$")
    goal: str | None = None
    step: int = Field(default=0, ge=0, le=10)


class ProductEventRequest(BaseModel):
    name: str = Field(max_length=50)
    properties: dict[str, Any] = Field(default_factory=dict)


def _onboarding(user_id) -> dict:
    item = feature_collection("product_state").find_one({"user_id": user_id}) or {}
    return {
        "status": item.get("onboarding_status", "not_started"),
        "goal": item.get("onboarding_goal"),
        "step": int(item.get("onboarding_step", 0)),
        "updatedAt": to_iso(item.get("updated_at")),
    }


@router.get("/bootstrap")
def bootstrap(current_user: dict = Depends(get_current_user)) -> dict:
    preferences = get_user_preferences(current_user["_id"])
    return {
        "features": feature_flags(),
        "onboarding": _onboarding(current_user["_id"]),
        "analyticsConsent": bool(preferences.get("productAnalytics", False)),
    }


@router.patch("/onboarding")
def save_onboarding(payload: OnboardingUpdate, current_user: dict = Depends(get_current_user)) -> dict:
    if payload.goal is not None and payload.goal not in ONBOARDING_GOALS:
        raise HTTPException(status_code=422, detail="Choose a supported onboarding goal.")
    now = utc_now()
    feature_collection("product_state").update_one(
        {"user_id": current_user["_id"]},
        {"$set": {"onboarding_status": payload.status, "onboarding_goal": payload.goal, "onboarding_step": payload.step, "updated_at": now}, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    if payload.status in {"completed", "skipped"}:
        preferences = get_user_preferences(current_user["_id"])
        if preferences.get("productAnalytics"):
            record_product_event(current_user["_id"], f"onboarding_{payload.status}", {"journey": payload.goal or "none"})
    return {"onboarding": _onboarding(current_user["_id"])}


@router.post("/events", status_code=202)
def create_product_event(payload: ProductEventRequest, current_user: dict = Depends(get_current_user)) -> dict:
    if payload.name not in ALLOWED_PRODUCT_EVENTS:
        raise HTTPException(status_code=422, detail="Unknown product event.")
    if not get_user_preferences(current_user["_id"]).get("productAnalytics"):
        return {"recorded": False, "reason": "consent_required"}
    return {"recorded": record_product_event(current_user["_id"], payload.name, payload.properties)}


@router.get('/meeting')
def read_meeting(current_user: dict = Depends(get_current_user)) -> dict:
    from app.companion_identity import meeting_payload
    return meeting_payload(current_user)


from app.companion_identity import MeetingUpdate


@router.patch('/meeting')
def save_meeting(payload: MeetingUpdate, current_user: dict = Depends(get_current_user)) -> dict:
    from app.companion_identity import meeting_payload
    from app.database import users_collection, serialize_user
    users = users_collection()
    existing = current_user.get('companion_profile') or {}
    changes = payload.model_dump(exclude_none=True, exclude={'complete', 'expectedVersion'})
    merged = {**existing, **changes}
    if payload.complete and not str(merged.get('preferredName') or '').strip():
        raise HTTPException(status_code=422, detail='Tell Emora what to call you first.')
    query = {'_id': current_user['_id']}
    query['companion_profile.version'] = payload.expectedVersion if payload.expectedVersion else {'$exists': False}
    updates = {f'companion_profile.{key}': value for key, value in changes.items()}
    updates['companion_profile.version'] = payload.expectedVersion + 1
    updates['companion_profile.onboardingVersion'] = 1
    if payload.complete:
        updates['companion_profile.completed'] = True
        updates['onboarding_required'] = False
    result = users.update_one(query, {'$set': updates})
    if not result.matched_count:
        raise HTTPException(status_code=409, detail='Your profile changed in another tab. Reload to continue with the saved version.')
    if payload.complete:
        feature_collection('product_state').update_one({'user_id':current_user['_id']}, {'$set':{'onboarding_status':'completed','onboarding_step':7,'updated_at':utc_now()}}, upsert=True)
        if not existing.get('completed') and get_user_preferences(current_user['_id']).get('productAnalytics'):
            record_product_event(current_user['_id'], 'onboarding_completed', {'journey':'first_meeting'})
    user=users.find_one({'_id':current_user['_id']})
    return {**meeting_payload(user), 'user':serialize_user(user)}


from app.routers.experiences import TaughtMemoryRequest


@router.post('/meeting/memory')
def remember_first_meeting(payload: TaughtMemoryRequest, current_user: dict = Depends(get_current_user)) -> dict:
    from app.routers.experiences import teach_emora
    from app.database import users_collection
    result = teach_emora(payload, current_user)
    users_collection().update_one({'_id': current_user['_id']}, {'$set': {'companion_profile.memoryId': result['memory']['id']}})
    return result
