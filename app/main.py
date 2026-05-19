from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import ensure_indexes
from app.routers import api_auth, api_chat, pages, posts


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_indexes()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(pages.router)
app.include_router(api_auth.router, prefix="/api/auth")
app.include_router(api_auth.router, prefix="/auth")
app.include_router(api_chat.router)
app.include_router(posts.router)
# voice router
from app.routers import voices as api_voices
app.include_router(api_voices.router, prefix="/api/voices")


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}
