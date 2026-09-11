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


def _bool_env(name: str, default: str = "false") -> bool:
    value = os.getenv(name, default).strip().lower()
    if value not in {"1", "0", "true", "false", "yes", "no", "on", "off"}:
        raise RuntimeError(f"{name} must be a boolean value.")
    return value in {"1", "true", "yes", "on"}


def _int_env(name: str, default: str, legacy: str | None = None) -> int:
    raw = _env(name, legacy, default) if legacy else os.getenv(name, default)
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"{name} must be an integer, got {raw!r}.") from exc


def _float_env(name: str, default: str, legacy: str | None = None) -> float:
    raw = _env(name, legacy, default) if legacy else os.getenv(name, default)
    try:
        return float(raw)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"{name} must be a number, got {raw!r}.") from exc


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
    port: int = _int_env("PORT", "8000")
    public_app_url: str = os.getenv("PUBLIC_APP_URL", "http://127.0.0.1:8000").strip().rstrip("/")
    trust_proxy_headers: bool = _bool_env("TRUST_PROXY_HEADERS", "false")
    trusted_proxy_cidrs: str = os.getenv("TRUSTED_PROXY_CIDRS", "127.0.0.1/32,::1/128").strip()

    secret_key: str = os.getenv("JWT_SECRET", "change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_expire_days: int = _int_env("ACCESS_TOKEN_EXPIRE_DAYS", "7")
    admin_api_key: str = os.getenv("ADMIN_API_KEY", "")
    admin_emails: str = os.getenv("ADMIN_EMAILS", "")
    rate_limit_enabled: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    redis_url: str = os.getenv("REDIS_URL", "")
    redis_rate_limit_prefix: str = os.getenv("REDIS_RATE_LIMIT_PREFIX", "emora:rate-limit")
    clamav_socket: str = os.getenv("CLAMAV_SOCKET", "")
    audio_cache_max_age_days: int = _int_env("AUDIO_CACHE_MAX_AGE_DAYS", "7")
    auth_session_retention_days: int = _int_env("AUTH_SESSION_RETENTION_DAYS", "30")
    security_event_retention_days: int = _int_env("SECURITY_EVENT_RETENTION_DAYS", "180")
    billing_request_retention_days: int = _int_env("BILLING_REQUEST_RETENTION_DAYS", "365")
    check_in_delivery_retention_days: int = _int_env("CHECK_IN_DELIVERY_RETENTION_DAYS", "90")
    chat_turn_retention_days: int = _int_env("CHAT_TURN_RETENTION_DAYS", "30")
    chat_turn_lease_seconds: int = _int_env("CHAT_TURN_LEASE_SECONDS", "900")
    tts_worker_count: int = _int_env("TTS_WORKER_COUNT", "4")
    tts_queue_max_pending: int = _int_env("TTS_QUEUE_MAX_PENDING", "24")
    tts_priority_reserved: int = _int_env("TTS_PRIORITY_RESERVED", "4")
    tts_queue_wait_seconds: float = _float_env("TTS_QUEUE_WAIT_SECONDS", "3")
    tts_engine: str = os.getenv("TTS_ENGINE", "qwen3-mlx")
    tts_qwen_model: str = os.getenv("TTS_QWEN_MODEL", "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-6bit")
    tts_transformers_model: str = os.getenv("TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice")
    tts_streaming_interval: float = _float_env("TTS_STREAMING_INTERVAL", "0.32")
    tts_sample_rate: int = _int_env("TTS_SAMPLE_RATE", "24000")
    tts_pronunciation_dictionary: str = os.getenv("TTS_PRONUNCIATION_DICTIONARY", "")

    mongo_uri: str = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/ai-companion-fastapi")
    mongo_database: str = field(default_factory=lambda: _derive_database_name(os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/ai-companion-fastapi")))
    mongo_server_selection_timeout_ms: int = _int_env("MONGO_SERVER_SELECTION_TIMEOUT_MS", "5000")

    email_host: str = os.getenv("EMAIL_HOST", "smtp.gmail.com")
    email_port: int = _int_env("EMAIL_PORT", "587")
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
    chat_mlx_max_tokens: int = _int_env("CHAT_MLX_MAX_TOKENS", "1024")
    chat_mlx_temperature: float = _float_env("CHAT_MLX_TEMPERATURE", "0.7")
    # Companion chat favors a direct, spoken-quality response. Qwen's optional
    # reasoning mode adds latency and is more prone to surfacing its internal
    # structure on small local models.
    chat_mlx_enable_thinking: bool = os.getenv("CHAT_MLX_ENABLE_THINKING", "false").lower() in {"1", "true", "yes", "on"}
    # auto enables Qwen reasoning only for explicitly complex turns. The
    # legacy boolean remains supported as an explicit always-on override.
    chat_mlx_thinking_mode: str = os.getenv("CHAT_MLX_THINKING_MODE", "auto").strip().lower()
    chat_worker_count: int = _int_env("CHAT_WORKER_COUNT", "1")
    chat_queue_max_pending: int = _int_env("CHAT_QUEUE_MAX_PENDING", "32")
    chat_queue_wait_seconds: float = _float_env("CHAT_QUEUE_WAIT_SECONDS", "3")
    # WEB_SEARCH_* is the public contract. EMORA_* remains a compatibility
    # fallback for existing deployments, never a second configuration path.
    emora_web_search_enabled: bool = _env("WEB_SEARCH_ENABLED", "EMORA_WEB_SEARCH_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
    emora_web_search_provider: str = _env("WEB_SEARCH_PROVIDER", "EMORA_WEB_SEARCH_PROVIDER", "tavily").strip().lower()
    emora_web_search_api_key: str = _env("TAVILY_API_KEY", "EMORA_WEB_SEARCH_API_KEY").strip()
    emora_web_search_max_results: int = min(10, max(1, _int_env("WEB_SEARCH_MAX_RESULTS", "5", "EMORA_WEB_SEARCH_MAX_RESULTS")))
    emora_web_search_timeout_seconds: float = max(1.0, _float_env("WEB_SEARCH_TIMEOUT", "10", "EMORA_WEB_SEARCH_TIMEOUT_SECONDS"))
    emora_web_search_retries: int = min(2, max(0, _int_env("WEB_SEARCH_RETRIES", "1", "EMORA_WEB_SEARCH_RETRIES")))
    emora_web_search_cache_enabled: bool = _env("WEB_SEARCH_CACHE_ENABLED", "EMORA_WEB_SEARCH_CACHE_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    emora_web_search_cache_seconds: int = max(15, _int_env("WEB_SEARCH_CACHE_SECONDS", "300", "EMORA_WEB_SEARCH_CACHE_SECONDS"))
    emora_web_search_max_tool_iterations: int = min(3, max(1, _int_env("WEB_SEARCH_MAX_TOOL_ITERATIONS", "3")))
    vision_mlx_model: str = os.getenv("VISION_MLX_MODEL", "mlx-community/Qwen2-VL-2B-Instruct-4bit")
    vision_mlx_max_tokens: int = _int_env("VISION_MLX_MAX_TOKENS", "180")
    # Hardware selection is independent from optional remote-provider routing.
    # EMORA_BACKEND owns native MLX/CUDA/CPU execution.
    emora_backend: str = os.getenv("EMORA_BACKEND", "auto").strip().lower()
    device: str = os.getenv("DEVICE", "auto").strip().lower()
    enable_vision: bool = _bool_env("ENABLE_VISION", "true")
    enable_tts: bool = _bool_env("ENABLE_TTS", "true")
    keep_models_warm: bool = _bool_env("KEEP_MODELS_WARM", "true")
    model_idle_timeout_seconds: int = max(0, _int_env("MODEL_IDLE_TIMEOUT_SECONDS", "900"))
    chat_transformers_model: str = os.getenv("CHAT_MODEL", "Qwen/Qwen3-4B").strip()
    vision_transformers_model: str = os.getenv("VISION_MODEL", "Qwen/Qwen2-VL-2B-Instruct").strip()
    # "auto" is MLX-first and falls through only to explicitly configured
    # providers. "local" remains a backwards-compatible alias for auto.
    inference_provider: str = os.getenv("LLM_PROVIDER", os.getenv("INFERENCE_PROVIDER", "auto")).strip().lower()
    mlx_enabled: bool = os.getenv("MLX_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    local_llm_enabled: bool = os.getenv("LOCAL_LLM_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
    local_llm_url: str = os.getenv("LOCAL_LLM_URL", "").strip().rstrip("/")
    local_llm_model: str = os.getenv("LOCAL_LLM_MODEL", "").strip()
    cloud_llm_enabled: bool = os.getenv("CLOUD_LLM_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
    cloud_llm_url: str = os.getenv("CLOUD_LLM_URL", "").strip().rstrip("/")
    cloud_llm_model: str = os.getenv("CLOUD_LLM_MODEL", "").strip()
    cloud_llm_api_key: str = os.getenv("CLOUD_LLM_API_KEY", "").strip()
    provider_health_ttl_seconds: int = max(10, _int_env("PROVIDER_HEALTH_TTL_SECONDS", "60"))
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


def validate_runtime_security(configuration: Settings = settings) -> None:
    """Fail closed on unsafe token-signing settings in production only."""
    if configuration.environment.strip().lower() != "production":
        return

    weak_secrets = {"", "change-me", "changeme", "secret", "replace-with-a-long-random-secret"}
    secret = configuration.secret_key.strip()
    if secret.lower() in weak_secrets or len(secret) < 32:
        raise RuntimeError("JWT_SECRET must be a unique secret of at least 32 characters in production.")

    if configuration.jwt_algorithm not in {"HS256", "HS384", "HS512"}:
        raise RuntimeError("JWT_ALGORITHM must be HS256, HS384, or HS512 in production.")


def validate_runtime_configuration(configuration: Settings = settings) -> None:
    """Validate cross-setting contracts that cannot be expressed by field types."""
    errors: list[str] = []

    if not 1 <= configuration.port <= 65535:
        errors.append("PORT must be between 1 and 65535")
    if configuration.access_token_expire_days <= 0:
        errors.append("ACCESS_TOKEN_EXPIRE_DAYS must be positive")
    if configuration.mongo_server_selection_timeout_ms <= 0:
        errors.append("MONGO_SERVER_SELECTION_TIMEOUT_MS must be positive")
    for name in ("tts_worker_count", "tts_queue_max_pending", "chat_worker_count", "chat_queue_max_pending"):
        if getattr(configuration, name) <= 0:
            errors.append(f"{name.upper()} must be positive")
    for name in ("audio_cache_max_age_days", "auth_session_retention_days", "security_event_retention_days", "billing_request_retention_days", "check_in_delivery_retention_days", "chat_turn_retention_days", "chat_turn_lease_seconds"):
        if getattr(configuration, name) <= 0:
            errors.append(f"{name.upper()} must be positive")
    if configuration.tts_priority_reserved < 0 or configuration.tts_priority_reserved >= configuration.tts_queue_max_pending:
        errors.append("TTS_PRIORITY_RESERVED must be non-negative and smaller than TTS_QUEUE_MAX_PENDING")
    if configuration.chat_mlx_thinking_mode not in {"auto", "never", "always"}:
        errors.append("CHAT_MLX_THINKING_MODE must be auto, never, or always")
    if configuration.inference_provider not in {"auto", "mlx", "local", "cloud", "modal"}:
        errors.append("LLM_PROVIDER must be auto, mlx, local, cloud, or modal")
    if configuration.emora_backend not in {"auto", "mlx", "cuda", "cpu"}:
        errors.append("EMORA_BACKEND must be auto, mlx, cuda, or cpu")
    if configuration.device not in {"auto", "metal", "cuda", "cpu"}:
        errors.append("DEVICE must be auto, metal, cuda, or cpu")
    expected_device = {"mlx": "metal", "cuda": "cuda", "cpu": "cpu"}.get(configuration.emora_backend)
    if expected_device and configuration.device not in {"auto", expected_device}:
        errors.append(f"DEVICE={configuration.device} conflicts with EMORA_BACKEND={configuration.emora_backend}")

    for name in ("public_app_url", "mongo_uri"):
        parsed = urlparse(getattr(configuration, name))
        if not parsed.scheme or not parsed.hostname:
            errors.append(f"{name.upper()} must be an absolute URL")

    if configuration.trust_proxy_headers:
        from ipaddress import ip_network

        candidates = [item.strip() for item in configuration.trusted_proxy_cidrs.split(",") if item.strip()]
        if not candidates:
            errors.append("TRUSTED_PROXY_CIDRS is required when TRUST_PROXY_HEADERS=true")
        for candidate in candidates:
            try:
                ip_network(candidate, strict=False)
            except ValueError:
                errors.append(f"TRUSTED_PROXY_CIDRS contains an invalid network: {candidate}")

    if configuration.environment.strip().lower() == "production":
        if urlparse(configuration.public_app_url).scheme != "https":
            errors.append("PUBLIC_APP_URL must use HTTPS in production")
        if configuration.google_client_id and urlparse(configuration.google_callback_url).scheme != "https":
            errors.append("GOOGLE_CALLBACK_URL must use HTTPS in production")

    if errors:
        raise RuntimeError("Invalid runtime configuration: " + "; ".join(errors) + ".")
