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
