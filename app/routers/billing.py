from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.access import PLAN_CATALOG, access_profile, public_plan_catalog
from app.audit import audit_event
from app.database import feature_collection, parse_object_id, serialize_user, users_collection, utc_now
from app.rate_limit import rate_limit
from app.security import get_current_user, require_platform_admin


router = APIRouter(prefix="/api/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    plan: str = Field(pattern="^(plus|pro|complete)$")
    cycle: str = Field(pattern="^(monthly|yearly)$")
    payment_method: str = Field(alias="paymentMethod", pattern="^(card|upi)$")


class SubscriptionUpdateRequest(BaseModel):
    plan: str = Field(pattern="^(free|plus|pro|complete)$")
    status: str = Field(default="active", pattern="^(active|trialing|inactive|canceled)$")
    note: str = Field(default="", max_length=240)


def _serialize_request(document: dict | None) -> dict | None:
    if not document:
        return None
    return {
        "id": str(document["_id"]),
        "plan": document["plan"],
        "cycle": document["cycle"],
        "status": document.get("status", "pending"),
        "createdAt": document["created_at"].isoformat(),
    }


def _serialize_subscription(subscription: dict | None) -> dict | None:
    if not subscription:
        return None
    return {
        "plan": subscription.get("plan", "free"),
        "status": subscription.get("status", "inactive"),
        "source": subscription.get("source"),
        "note": subscription.get("note", ""),
        "updatedAt": subscription.get("updated_at").isoformat() if subscription.get("updated_at") else None,
        "updatedBy": str(subscription["updated_by"]) if subscription.get("updated_by") else None,
    }


@router.get("/plans")
def list_plans() -> dict:
    return {"plans": public_plan_catalog(), "currency": "INR", "billingProviderConnected": False}


@router.get("/access")
def get_access(current_user: dict = Depends(get_current_user)) -> dict:
    pending = feature_collection("billing_requests").find_one(
        {"user_id": current_user["_id"], "status": "pending"},
        sort=[("created_at", -1)],
    )
    return {"access": access_profile(current_user), "pendingRequest": _serialize_request(pending)}


@router.post("/checkout", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(rate_limit(8, 300, "billing-checkout"))])
def request_checkout(payload: CheckoutRequest, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now()
    document = {
        "user_id": current_user["_id"],
        "email": current_user.get("email", ""),
        "plan": payload.plan,
        "cycle": payload.cycle,
        "payment_method": payload.payment_method,
        "amount": PLAN_CATALOG[payload.plan][payload.cycle],
        "currency": "INR",
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }
    result = feature_collection("billing_requests").insert_one(document)
    document["_id"] = result.inserted_id
    users_collection().update_one(
        {"_id": current_user["_id"]},
        {"$set": {"subscription_request": {"id": result.inserted_id, "plan": payload.plan, "cycle": payload.cycle, "status": "pending", "updated_at": now}}},
    )
    audit_event("billing.checkout.requested", user_id=current_user["_id"], plan=payload.plan, cycle=payload.cycle)
    return {
        "request": _serialize_request(document),
        "access": access_profile(current_user),
        "message": "Your plan request is pending payment-provider verification. No card or UPI details were sent or stored.",
    }


@router.get("/admin/users")
def list_subscription_users(
    search: str = Query(default="", max_length=120),
    _: dict = Depends(require_platform_admin),
) -> dict:
    query = {}
    if search.strip():
        expression = re.compile(re.escape(search.strip()), re.IGNORECASE)
        query = {"$or": [{"email": expression}, {"name": expression}]}
    users = users_collection().find(query).sort("created_at", -1).limit(40)
    return {
        "users": [
            {
                "id": str(user["_id"]),
                "name": user.get("name", ""),
                "email": user.get("email", ""),
                "subscription": _serialize_subscription(user.get("subscription")),
                "access": access_profile(user),
            }
            for user in users
        ]
    }


@router.patch("/admin/users/{user_id}/subscription")
def update_subscription(
    user_id: str,
    payload: SubscriptionUpdateRequest,
    admin_user: dict = Depends(require_platform_admin),
) -> dict:
    object_id = parse_object_id(user_id)
    if not object_id:
        raise HTTPException(status_code=404, detail="Account not found.")
    now = utc_now()
    subscription = {
        "plan": payload.plan,
        "status": "inactive" if payload.plan == "free" else payload.status,
        "source": "administrator",
        "note": payload.note.strip(),
        "updated_at": now,
        "updated_by": admin_user["_id"],
    }
    updated = users_collection().find_one_and_update(
        {"_id": object_id},
        {"$set": {"subscription": subscription}},
        return_document=True,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Account not found.")
    audit_event("billing.subscription.updated", user_id=object_id, admin_user_id=admin_user["_id"], plan=payload.plan, status=subscription["status"])
    return {"user": serialize_user(updated), "subscription": _serialize_subscription(subscription)}
