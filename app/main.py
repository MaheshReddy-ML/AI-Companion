from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio
import logging
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings, validate_runtime_security
from app.database import check_database_connection, ensure_indexes
from app.voice_manager import cleanup_audio_cache
from app.routers import account, admin, api_auth, api_chat, billing, companion, experiences, insights, pages, personal, play, posts, workspace_features
from app.inference.provider import provider_status


logger = logging.getLogger(__name__)


async def _scheduled_check_in_worker() -> None:
    while True:
        try:
            await asyncio.to_thread(workspace_features.deliver_due_email_check_ins)
        except Exception as exc:
            logger.warning("Scheduled check-in delivery pass failed: %s", exc)
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_runtime_security()
    try:
        ensure_indexes()
    except RuntimeError as exc:
        logger.warning("Startup continued without MongoDB indexes: %s", exc)
    cleaned = cleanup_audio_cache(settings.audio_cache_max_age_days)
    if cleaned:
        logger.info("Removed %d expired audio cache files", cleaned)
    check_in_task = asyncio.create_task(_scheduled_check_in_worker())
    try:
        yield
    finally:
        check_in_task.cancel()
        try:
            await check_in_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title=settings.app_name, lifespan=lifespan)
STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _set_default_header(response, name: str, value: str) -> None:
    if name not in response.headers:
        response.headers[name] = value


@app.middleware("http")
async def secure_browser_defaults(request: Request, call_next):
    """Add conservative browser protections without changing app contracts."""
    request_id = uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    _set_default_header(response, "X-Content-Type-Options", "nosniff")
    _set_default_header(response, "X-Frame-Options", "DENY")
    _set_default_header(response, "X-Permitted-Cross-Domain-Policies", "none")
    _set_default_header(response, "Referrer-Policy", "strict-origin-when-cross-origin")
    _set_default_header(response, "Permissions-Policy", "camera=(self), microphone=(self), geolocation=()")

    if request.url.path.startswith(("/api/", "/auth/")):
        response.headers["Cache-Control"] = "private, no-store"

    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip().lower()
    is_https = request.url.scheme == "https" or forwarded_proto == "https"
    if settings.environment.lower() == "production" and is_https:
        _set_default_header(response, "Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.middleware("http")
async def disable_development_browser_cache(request: Request, call_next):
    """Keep localhost development from serving stale HTML, CSS, or JS.

    Production retains normal browser and CDN caching. In development we also
    remove conditional validators before StaticFiles runs, ensuring a cached
    localhost request receives a fresh 200 response instead of a stale 304.
    """
    development = settings.environment.lower() != "production"
    static_request = request.url.path.startswith("/static/")
    if development and static_request:
        request.scope["headers"] = [
            (name, value)
            for name, value in request.scope.get("headers", [])
            if name.lower() not in {b"if-none-match", b"if-modified-since"}
        ]

    response = await call_next(request)
    content_type = response.headers.get("content-type", "").lower()
    if development and (static_request or "text/html" in content_type):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        if "etag" in response.headers:
            del response.headers["etag"]
        if "last-modified" in response.headers:
            del response.headers["last-modified"]
        if "text/html" in content_type:
            response.headers["Clear-Site-Data"] = '"cache"'
    return response


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
app.include_router(experiences.router)
app.include_router(posts.router)
app.include_router(admin.router)
app.include_router(billing.router)
app.include_router(workspace_features.router)
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
        "chatProvider": provider_status(),
        "webSearchEnabled": settings.emora_web_search_enabled,
        "webSearchProvider": settings.emora_web_search_provider,
        "webSearchConfigured": settings.emora_web_search_provider in {"duckduckgo", "ddg"} or bool(settings.emora_web_search_api_key),
        "emailConfigured": settings.email_configured,
        "googleConfigured": bool(settings.google_client_id),
    }
