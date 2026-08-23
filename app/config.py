from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _derive_database_name(mongo_uri: str) -> str:
    parsed = urlparse(mongo_uri)
    db_name = parsed.path.lstrip("/")
    return db_name or "ai_companion_fastapi"


def _env(primary: str, legacy: str, default: str = "") -> str:
    """Read the documented setting first while preserving older deployments."""
    return os.getenv(primary, os.getenv(legacy, default))


@dataclass(slots=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "AI Companion FastAPI")
    environment: str = os.getenv("APP_ENV", "development")
    # This is deliberately opt-in and is always disabled in production. It
    # exposes only transient behavior telemetry already delivered to the
    # signed-in browser; it must never become a production diagnostics panel.
    companion_debug: bool = (
        os.getenv("COMPANION_DEBUG", "false").lower() in {"1", "true", "yes", "on"}
        and os.getenv("APP_ENV", "development").lower() != "production"
    )
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8000"))

    secret_key: str = os.getenv("JWT_SECRET", "change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_expire_days: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "7"))
    admin_api_key: str = os.getenv("ADMIN_API_KEY", "")
    admin_emails: str = os.getenv("ADMIN_EMAILS", "hemu171807@gmail.com,emoracomapnion@gmail.com")
    rate_limit_enabled: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    redis_url: str = os.getenv("REDIS_URL", "")
    redis_rate_limit_prefix: str = os.getenv("REDIS_RATE_LIMIT_PREFIX", "emora:rate-limit")
    clamav_socket: str = os.getenv("CLAMAV_SOCKET", "")
    audio_cache_max_age_days: int = int(os.getenv("AUDIO_CACHE_MAX_AGE_DAYS", "7"))
    tts_worker_count: int = int(os.getenv("TTS_WORKER_COUNT", "4"))
    tts_queue_max_pending: int = int(os.getenv("TTS_QUEUE_MAX_PENDING", "24"))
    tts_priority_reserved: int = int(os.getenv("TTS_PRIORITY_RESERVED", "4"))
    tts_queue_wait_seconds: float = float(os.getenv("TTS_QUEUE_WAIT_SECONDS", "3"))
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

    # Local chat model weights download once into the Hugging Face cache and
    # remain loaded for the lifetime of the running server process.
    chat_mlx_model: str = os.getenv("CHAT_MLX_MODEL", "Qwen/Qwen3-4B-MLX-4bit")
    chat_mlx_max_tokens: int = int(os.getenv("CHAT_MLX_MAX_TOKENS", "1024"))
    chat_mlx_temperature: float = float(os.getenv("CHAT_MLX_TEMPERATURE", "0.7"))
    # Companion chat favors a direct, spoken-quality response. Qwen's optional
    # reasoning mode adds latency and is more prone to surfacing its internal
    # structure on small local models.
    chat_mlx_enable_thinking: bool = os.getenv("CHAT_MLX_ENABLE_THINKING", "false").lower() in {"1", "true", "yes", "on"}
    # auto enables Qwen reasoning only for explicitly complex turns. The
    # legacy boolean remains supported as an explicit always-on override.
    chat_mlx_thinking_mode: str = os.getenv("CHAT_MLX_THINKING_MODE", "auto").strip().lower()
    chat_worker_count: int = int(os.getenv("CHAT_WORKER_COUNT", "1"))
    chat_queue_max_pending: int = int(os.getenv("CHAT_QUEUE_MAX_PENDING", "32"))
    chat_queue_wait_seconds: float = float(os.getenv("CHAT_QUEUE_WAIT_SECONDS", "3"))
    # WEB_SEARCH_* is the public contract. EMORA_* remains a compatibility
    # fallback for existing deployments, never a second configuration path.
    emora_web_search_enabled: bool = _env("WEB_SEARCH_ENABLED", "EMORA_WEB_SEARCH_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
    emora_web_search_provider: str = _env("WEB_SEARCH_PROVIDER", "EMORA_WEB_SEARCH_PROVIDER", "tavily").strip().lower()
    emora_web_search_api_key: str = _env("TAVILY_API_KEY", "EMORA_WEB_SEARCH_API_KEY").strip()
    emora_web_search_max_results: int = min(10, max(1, int(_env("WEB_SEARCH_MAX_RESULTS", "EMORA_WEB_SEARCH_MAX_RESULTS", "5"))))
    emora_web_search_timeout_seconds: float = max(1.0, float(_env("WEB_SEARCH_TIMEOUT", "EMORA_WEB_SEARCH_TIMEOUT_SECONDS", "10")))
    emora_web_search_retries: int = min(2, max(0, int(_env("WEB_SEARCH_RETRIES", "EMORA_WEB_SEARCH_RETRIES", "1"))))
    emora_web_search_cache_enabled: bool = _env("WEB_SEARCH_CACHE_ENABLED", "EMORA_WEB_SEARCH_CACHE_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    emora_web_search_cache_seconds: int = max(15, int(_env("WEB_SEARCH_CACHE_SECONDS", "EMORA_WEB_SEARCH_CACHE_SECONDS", "300")))
    emora_web_search_max_tool_iterations: int = min(3, max(1, int(os.getenv("WEB_SEARCH_MAX_TOOL_ITERATIONS", "3"))))
    vision_mlx_model: str = os.getenv("VISION_MLX_MODEL", "mlx-community/Qwen2-VL-2B-Instruct-4bit")
    vision_mlx_max_tokens: int = int(os.getenv("VISION_MLX_MAX_TOKENS", "180"))
    # Inference provider selection: 'local' (MLX on mac) or 'modal' (cloud GPU)
    inference_provider: str = os.getenv("INFERENCE_PROVIDER", "local").strip().lower()
    # Optional cloud model overrides for Modal provider. If unset, the code
    # will attempt to use the MLX model ids as a starting point.
    chat_modal_model: str = os.getenv("CHAT_MODAL_MODEL", "")
    vision_modal_model: str = os.getenv("VISION_MODAL_MODEL", "")


    @property
    def google_audiences(self) -> list[str]:
        raw = self.google_client_ids or self.google_client_id
        return [item.strip() for item in raw.split(",") if item.strip()]

    @property
    def email_configured(self) -> bool:
        return bool(self.email_user and self.email_password)

    @property
    def admin_email_set(self) -> set[str]:
        return {item.strip().lower() for item in self.admin_emails.split(",") if item.strip()}


settings = Settings()
