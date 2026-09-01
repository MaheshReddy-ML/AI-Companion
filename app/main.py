from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio
import logging
import os
from time import perf_counter
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import BASE_DIR, settings, validate_runtime_configuration, validate_runtime_security
from app.database import check_database_connection, close_database
from app.http_security import request_is_https
from app.migrations import run_migrations
from app.voice_manager import cleanup_audio_cache
from app.routers import account, admin, api_auth, api_chat, billing, companion, experiences, insights, pages, personal, play, posts, premium_experiences, product_operations, together, workspace_features
from app.inference.provider import provider_status
from app.audit import reset_request_id, set_request_id
from app.metrics import observe_request
from app.services.inference_queue import begin_chat_queue_shutdown
from app.tts_queue import begin_tts_queue_shutdown
from app.rate_limit import rate_limit_backend_status
from app.product_operations import feature_flags


logger = logging.getLogger(__name__)

CONTENT_SECURITY_POLICY = "; ".join(
    (
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self' https://accounts.google.com",
        "script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob:",
        "connect-src 'self' https://api.open-meteo.com https://accounts.google.com",
        "worker-src 'self' blob:",
    )
)


async def _scheduled_check_in_worker() -> None:
    while True:
        try:
            await asyncio.to_thread(workspace_features.deliver_due_email_check_ins)
        except Exception as exc:
            logger.warning("Scheduled check-in delivery pass failed: %s", exc)
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_runtime_configuration()
    validate_runtime_security()
    try:
        completed_migrations = run_migrations()
        if completed_migrations:
            logger.info("Applied database migrations: %s", completed_migrations)
    except RuntimeError as exc:
        logger.warning("Startup continued without MongoDB indexes: %s", exc)
    cleaned = cleanup_audio_cache(settings.audio_cache_max_age_days)
    if cleaned:
        logger.info("Removed %d expired audio cache files", cleaned)
    check_in_task = asyncio.create_task(_scheduled_check_in_worker())
    try:
        yield
    finally:
        begin_chat_queue_shutdown()
        begin_tts_queue_shutdown()
        check_in_task.cancel()
        try:
            await check_in_task
        except asyncio.CancelledError:
            pass
        close_database()


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
    request_token = set_request_id(request_id)
    started_at = perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        route = getattr(request.scope.get("route"), "path", "unmatched")
        observe_request(request.method, route, 500, (perf_counter() - started_at) * 1000)
        raise
    finally:
        reset_request_id(request_token)
    route = getattr(request.scope.get("route"), "path", "unmatched")
    observe_request(request.method, route, response.status_code, (perf_counter() - started_at) * 1000)
    response.headers["X-Request-ID"] = request_id
    _set_default_header(response, "X-Content-Type-Options", "nosniff")
    _set_default_header(response, "X-Frame-Options", "DENY")
    _set_default_header(response, "X-Permitted-Cross-Domain-Policies", "none")
    _set_default_header(response, "Referrer-Policy", "strict-origin-when-cross-origin")
    _set_default_header(response, "Permissions-Policy", "camera=(self), microphone=(self), geolocation=()")
    _set_default_header(response, "Content-Security-Policy-Report-Only", CONTENT_SECURITY_POLICY)

    if request.url.path.startswith(("/api/", "/auth/")):
        response.headers["Cache-Control"] = "private, no-store"

    if settings.environment.lower() == "production" and request_is_https(request):
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
    return RedirectResponse(url="/static/images/emora-logo-v2-64.png?v=20260828-orbit")

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
app.include_router(premium_experiences.router)
app.include_router(product_operations.router)
app.include_router(together.router)
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


@app.get("/api/public/status")
def public_status() -> dict:
    flags = feature_flags()
    return {
        "status": "operational",
        "updatedAt": "live",
        "components": {
            "website": "operational",
            "authentication": "operational",
            "chat": "operational",
            "voice": "available_on_supported_devices",
            "webGrounding": "available_when_configured" if flags.get("web_grounding") else "paused",
            "communityWrites": "operational" if flags.get("community_writes") else "paused",
            "scheduledDelivery": "operational" if flags.get("scheduled_delivery") else "paused",
        },
    }


@app.get("/health/ready", response_model=None)
def readiness_check() -> JSONResponse:
    database = check_database_connection()
    redis = rate_limit_backend_status()
    storage_paths = [STATIC_DIR / "uploads", BASE_DIR / "cache"]
    storage = {
        "ok": all(path.exists() and os.access(path, os.W_OK) for path in storage_paths),
        "paths": [str(path.relative_to(BASE_DIR)) for path in storage_paths],
    }
    required_ready = database["ok"] and redis["ok"] and storage["ok"]
    payload = {
        "status": "ready" if required_ready else "not_ready",
        "database": database,
        "rateLimitBackend": redis,
        "storage": storage,
        "chatConfigured": True,
        "chatProvider": provider_status(),
        "webSearchEnabled": settings.emora_web_search_enabled,
        "webSearchProvider": settings.emora_web_search_provider,
        "webSearchConfigured": settings.emora_web_search_provider in {"duckduckgo", "ddg"} or bool(settings.emora_web_search_api_key),
        "emailConfigured": settings.email_configured,
        "googleConfigured": bool(settings.google_client_id),
    }
    return JSONResponse(payload, status_code=status.HTTP_200_OK if required_ready else status.HTTP_503_SERVICE_UNAVAILABLE)
