from __future__ import annotations

import importlib.util
import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Iterator

from app.config import settings
from app.inference.base import ChatProvider, VisionProvider, VisionAnalysisError


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ProviderCandidate:
    name: str
    priority: int
    enabled: bool
    loader: Callable[[], ChatProvider]


class ProviderManager:
    """MLX-first provider selection with cached health and one-pass fallback."""

    def __init__(self, candidates: list[ProviderCandidate], health_ttl: int = 60):
        self.candidates = sorted(candidates, key=lambda item: item.priority, reverse=True)
        self.health_ttl = max(1, health_ttl)
        self._instances: dict[str, ChatProvider] = {}
        self._health: dict[str, tuple[float, bool, str]] = {}
        self._active: str | None = None
        self._fallback_reason: str | None = None

    def _load(self, candidate: ProviderCandidate) -> ChatProvider:
        if candidate.name not in self._instances:
            self._instances[candidate.name] = candidate.loader()
        return self._instances[candidate.name]

    def _healthy(self, candidate: ProviderCandidate) -> tuple[bool, str]:
        cached = self._health.get(candidate.name)
        if cached and time.monotonic() - cached[0] < self.health_ttl:
            return cached[1], cached[2]
        try:
            provider = self._load(candidate)
            check = getattr(provider, "health_check", None)
            ok, reason = check() if callable(check) else (True, "loaded")
        except Exception as exc:
            ok, reason = False, str(exc)
        self._health[candidate.name] = (time.monotonic(), bool(ok), str(reason))
        return bool(ok), str(reason)

    def _available(self) -> list[tuple[ProviderCandidate, ChatProvider]]:
        available = []
        for candidate in self.candidates:
            if not candidate.enabled:
                continue
            healthy, reason = self._healthy(candidate)
            if healthy:
                available.append((candidate, self._load(candidate)))
            else:
                logger.info("chat_provider_unavailable provider=%s reason=%s", candidate.name, reason)
        return available

    def generate(self, **kwargs: Any) -> str:
        failures: list[str] = []
        for candidate, provider in self._available():
            try:
                result = provider.generate(**kwargs)
                self._fallback_reason = "; ".join(failures) or None
                self._active = candidate.name
                logger.info("chat_provider_active provider=%s fallback=%s", candidate.name, bool(failures))
                return result
            except Exception as exc:
                failures.append(f"{candidate.name}: {exc}")
                self._health[candidate.name] = (time.monotonic(), False, f"runtime failure: {exc}")
                logger.warning("chat_provider_failed provider=%s", candidate.name)
        raise RuntimeError("No healthy chat provider is available" + (f" ({'; '.join(failures)})" if failures else ""))

    def stream(self, **kwargs: Any) -> Iterator[str]:
        failures: list[str] = []
        for candidate, provider in self._available():
            try:
                streamer = getattr(provider, "stream", None)
                if callable(streamer):
                    yield from streamer(**kwargs)
                else:
                    yield provider.generate(**kwargs)
                self._active = candidate.name
                self._fallback_reason = "; ".join(failures) or None
                return
            except Exception as exc:
                failures.append(f"{candidate.name}: {exc}")
                self._health[candidate.name] = (time.monotonic(), False, f"runtime failure: {exc}")
        raise RuntimeError("No healthy streaming provider is available")

    def runtime_stats(self) -> dict[str, Any]:
        providers = []
        for candidate in self.candidates:
            if not candidate.enabled:
                providers.append({"name": candidate.name, "priority": candidate.priority, "enabled": False, "healthy": False, "reason": "disabled"})
                continue
            healthy, reason = self._healthy(candidate)
            providers.append({"name": candidate.name, "priority": candidate.priority, "enabled": True, "healthy": healthy, "reason": reason})
        active_stats = self._instances[self._active].runtime_stats() if self._active and hasattr(self._instances[self._active], "runtime_stats") else {}
        return {"provider": self._active, "fallbackReason": self._fallback_reason, "providers": providers, **active_stats}

    def health_check(self) -> tuple[bool, str]:
        available = self._available()
        return bool(available), available[0][0].name if available else "no provider available"


def _local_mlx_provider() -> ChatProvider:
    from app.inference.local_adapter import local_chat_provider
    return local_chat_provider


def _modal_provider() -> ChatProvider:
    from app.inference.modal_gpu import modal_chat_provider
    return modal_chat_provider


def _http_provider(name: str, base_url: str, model: str, api_key: str = "") -> ChatProvider:
    from app.inference.http_adapter import OpenAICompatibleChatAdapter
    return OpenAICompatibleChatAdapter(name=name, base_url=base_url, default_model=model, api_key=api_key)


def _mlx_enabled() -> bool:
    return settings.mlx_enabled and bool(settings.chat_mlx_model) and importlib.util.find_spec("mlx_lm") is not None


def _build_chat_manager() -> ProviderManager:
    modal_only = settings.inference_provider == "modal"
    candidates = [
        ProviderCandidate("mlx", 100, not modal_only and _mlx_enabled(), _local_mlx_provider),
        ProviderCandidate("local", 80, not modal_only and settings.local_llm_enabled and bool(settings.local_llm_url), lambda: _http_provider("local", settings.local_llm_url, settings.local_llm_model or settings.chat_mlx_model)),
        ProviderCandidate("modal", 60, modal_only, _modal_provider),
        ProviderCandidate("cloud", 50, not modal_only and settings.cloud_llm_enabled and bool(settings.cloud_llm_url), lambda: _http_provider("cloud", settings.cloud_llm_url, settings.cloud_llm_model or settings.chat_mlx_model, settings.cloud_llm_api_key)),
    ]
    return ProviderManager(candidates, settings.provider_health_ttl_seconds)


_chat_provider = _build_chat_manager()


def _select_vision_provider() -> VisionProvider:
    if settings.inference_provider == "modal":
        from app.inference.modal_gpu import modal_vision_provider
        return modal_vision_provider
    from app.inference.local_adapter import local_vision_provider
    return local_vision_provider


_vision_provider = _select_vision_provider()


def get_chat_provider() -> ChatProvider:
    return _chat_provider


def get_vision_provider() -> VisionProvider:
    return _vision_provider


def provider_status() -> dict[str, Any]:
    return _chat_provider.runtime_stats()


__all__ = ["ProviderCandidate", "ProviderManager", "get_chat_provider", "get_vision_provider", "provider_status", "VisionAnalysisError"]
