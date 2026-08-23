from __future__ import annotations

from contextlib import asynccontextmanager
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import check_database_connection, ensure_indexes
from app.voice_manager import cleanup_audio_cache
from app.routers import account, admin, api_auth, api_chat, billing, companion, insights, pages, personal, play, posts


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        ensure_indexes()
    except RuntimeError as exc:
        logger.warning("Startup continued without MongoDB indexes: %s", exc)
    cleaned = cleanup_audio_cache(settings.audio_cache_max_age_days)
    if cleaned:
        logger.info("Removed %d expired audio cache files", cleaned)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> RedirectResponse:
    return RedirectResponse(url="/static/images/logo.svg?v=20260822-emora-mark")

app.include_router(pages.router)
app.include_router(api_auth.router, prefix="/api/auth")
app.include_router(api_auth.router, prefix="/auth")
app.include_router(api_chat.router)
app.include_router(companion.router)
app.include_router(account.router)
app.include_router(insights.router)
app.include_router(play.router)
app.include_router(personal.router)
app.include_router(posts.router)
app.include_router(admin.router)
app.include_router(billing.router)
# voice router
from app.routers import voices as api_voices
app.include_router(api_voices.router, prefix="/api/voices")


@app.get("/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
    }


@app.get("/health/ready")
def readiness_check() -> dict:
    database = check_database_connection()
    return {
        "status": "ready" if database["ok"] else "degraded",
        "database": database,
        "chatConfigured": True,
        "chatProvider": "local-mlx",
        "emailConfigured": settings.email_configured,
        "googleConfigured": bool(settings.google_client_id),
    }
