from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import settings
from app.database import check_database_connection, conversations_collection, posts_collection, users_collection
from app.inference.provider import get_chat_provider
from app.access import is_platform_admin
from app.security import get_optional_current_user

# provider-selected chat for diagnostics
local_mlx_chat = get_chat_provider()


router = APIRouter(prefix="/api/admin", tags=["admin"])


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
        "features": {
            "rateLimitEnabled": settings.rate_limit_enabled,
            "sessionRevocation": True,
            "hashedOtp": True,
            "postModeration": True,
            "chatSearchPagination": True,
        },
    }
