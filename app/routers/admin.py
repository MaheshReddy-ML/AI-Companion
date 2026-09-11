from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.config import settings
from app.database import as_utc, check_database_connection, conversations_collection, feature_collection, posts_collection, users_collection, utc_now
from app.inference.provider import get_chat_provider
from app.access import is_platform_admin
from app.security import get_optional_current_user
from app.metrics import metrics_snapshot
from app.product_operations import FLAG_DEFINITIONS, feature_flags
from app.audit import audit_event

# provider-selected chat for diagnostics
local_mlx_chat = get_chat_provider()


router = APIRouter(prefix="/api/admin", tags=["admin"])


class FeatureFlagUpdate(BaseModel):
    enabled: bool
    reason: str = Field(min_length=3, max_length=240)
    expiresAt: datetime | None = None


def require_admin_access(
    x_admin_key: str | None = Header(default=None),
    current_user: dict | None = Depends(get_optional_current_user),
) -> None:
    if is_platform_admin(current_user):
        return
    if not settings.admin_api_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin diagnostics are not enabled.")
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid admin key.")


@router.get("/diagnostics")
def diagnostics(_: None = Depends(require_admin_access)) -> dict:
    database = check_database_connection()
    counts = {"users": None, "conversations": None, "posts": None}

    if database["ok"]:
        counts = {
            "users": users_collection().estimated_document_count(),
            "conversations": conversations_collection().estimated_document_count(),
            "posts": posts_collection().estimated_document_count(),
        }

    return {
        "app": settings.app_name,
        "environment": settings.environment,
        "database": database,
        "counts": counts,
        "integrations": {
            "chatConfigured": True,
            "emailConfigured": settings.email_configured,
            "googleConfigured": bool(settings.google_client_id),
        },
        "localRuntime": {"chat": local_mlx_chat.runtime_stats()},
        "metrics": metrics_snapshot(),
        "features": {
            "rateLimitEnabled": settings.rate_limit_enabled,
            "sessionRevocation": True,
            "hashedOtp": True,
            "postModeration": True,
            "chatSearchPagination": True,
            "runtimeFlags": feature_flags(include_internal=True),
        },
    }


@router.get("/feature-flags")
def read_feature_flags(_: None = Depends(require_admin_access)) -> dict:
    return {"flags": feature_flags(include_internal=True)}


@router.put("/feature-flags/{name}")
def update_feature_flag(name: str, payload: FeatureFlagUpdate, _: None = Depends(require_admin_access)) -> dict:
    if name not in FLAG_DEFINITIONS:
        raise HTTPException(status_code=404, detail="Unknown feature flag.")
    expires_at = as_utc(payload.expiresAt) if payload.expiresAt is not None else None
    if expires_at is not None and expires_at <= utc_now():
        raise HTTPException(status_code=422, detail="Flag expiry must be in the future.")
    now = utc_now()
    feature_collection("feature_flags").update_one(
        {"name": name},
        {"$set": {"enabled": payload.enabled, "reason": payload.reason, "expires_at": expires_at, "updated_at": now}, "$setOnInsert": {"created_at": now, "owner": FLAG_DEFINITIONS[name]["owner"]}},
        upsert=True,
    )
    audit_event("feature_flag.updated", flag=name, enabled=payload.enabled)
    return {"name": name, "flag": feature_flags(include_internal=True)[name]}
