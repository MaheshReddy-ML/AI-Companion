from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _env_first(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value is not None and value != "":
            return value
    return default


def _derive_database_name(mongo_uri: str) -> str:
    parsed = urlparse(mongo_uri)
    db_name = parsed.path.lstrip("/")
    return db_name or "ai_companion_fastapi"


@dataclass(slots=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "AI Companion FastAPI")
    environment: str = os.getenv("APP_ENV", "development")
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8000"))

    secret_key: str = os.getenv("JWT_SECRET", "change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_expire_days: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "7"))
    admin_api_key: str = os.getenv("ADMIN_API_KEY", "")
    rate_limit_enabled: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    redis_url: str = os.getenv("REDIS_URL", "")
    redis_rate_limit_prefix: str = os.getenv("REDIS_RATE_LIMIT_PREFIX", "emora:rate-limit")
    clamav_socket: str = os.getenv("CLAMAV_SOCKET", "")
    audio_cache_max_age_days: int = int(os.getenv("AUDIO_CACHE_MAX_AGE_DAYS", "7"))
    tts_worker_count: int = int(os.getenv("TTS_WORKER_COUNT", "2"))
    tts_queue_max_pending: int = int(os.getenv("TTS_QUEUE_MAX_PENDING", "6"))
    tts_engine: str = os.getenv("TTS_ENGINE", "qwen3-mlx")
    tts_qwen_model: str = os.getenv("TTS_QWEN_MODEL", "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-6bit")
    tts_streaming_interval: float = float(os.getenv("TTS_STREAMING_INTERVAL", "0.32"))
    tts_sample_rate: int = int(os.getenv("TTS_SAMPLE_RATE", "24000"))
    tts_pronunciation_dictionary: str = os.getenv("TTS_PRONUNCIATION_DICTIONARY", "")

    mongo_uri: str = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/ai-companion-fastapi")
    mongo_database: str = field(default_factory=lambda: _derive_database_name(os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/ai-companion-fastapi")))
    mongo_server_selection_timeout_ms: int = int(os.getenv("MONGO_SERVER_SELECTION_TIMEOUT_MS", "5000"))

    email_host: str = os.getenv("EMAIL_HOST", "smtp.gmail.com")
    email_port: int = int(os.getenv("EMAIL_PORT", "587"))
    email_use_tls: bool = os.getenv("EMAIL_USE_TLS", "true").lower() in {"1", "true", "yes", "on"}
    email_user: str = os.getenv("EMAIL_USER", "")
    email_password: str = os.getenv("EMAIL_PASS", "")
    email_from_name: str = os.getenv("EMAIL_FROM_NAME", "AI Companion")

    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_ids: str = os.getenv("GOOGLE_CLIENT_IDS", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_callback_url: str = os.getenv("GOOGLE_CALLBACK_URL", "http://127.0.0.1:8000/auth/google/callback")
    google_auth_success_redirect: str = os.getenv("GOOGLE_AUTH_SUCCESS_REDIRECT", "http://127.0.0.1:8000/dashboard")
    google_auth_failure_redirect: str = os.getenv("GOOGLE_AUTH_FAILURE_REDIRECT", "http://127.0.0.1:8000/login?googleError=1")

    openai_api_key: str = _env_first("OPENAI_API_KEY", "VITE_OPENAI_API_KEY")
    openai_base_url: str = _env_first(
        "OPENAI_BASE_URL",
        "VITE_OPENAI_BASE_URL",
        default="https://models.inference.ai.azure.com/",
    )
    openai_model: str = _env_first("OPENAI_MODEL", "VITE_OPENAI_MODEL", default="gpt-4o")

    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    @property
    def google_audiences(self) -> list[str]:
        raw = self.google_client_ids or self.google_client_id
        return [item.strip() for item in raw.split(",") if item.strip()]

    @property
    def email_configured(self) -> bool:
        return bool(self.email_user and self.email_password)


settings = Settings()
