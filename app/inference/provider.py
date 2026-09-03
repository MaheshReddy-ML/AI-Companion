from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Iterator

from app.config import settings
from app.inference.base import BackendCapabilities, ChatProvider, VisionProvider, VisionAnalysisError
from app.inference.hardware import describe_device, select_hardware_backend


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ProviderCandidate:
    name: str
    priority: int
    enabled: bool
    loader: Callable[[], ChatProvider]


class ProviderManager:
    """Hardware-selected provider with cached health and one-pass remote fallback."""

    def __init__(self, candidates: list[ProviderCandidate], health_ttl: int = 60, keep_models_warm: bool = True):
        self.candidates = sorted(candidates, key=lambda item: item.priority, reverse=True)
        self.health_ttl = max(1, health_ttl)
        self.keep_models_warm = keep_models_warm
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
                if not self.keep_models_warm:
                    unload = getattr(provider, "unload_models", None)
                    if callable(unload):
                        unload()
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
                if not self.keep_models_warm:
                    unload = getattr(provider, "unload_models", None)
                    if callable(unload):
                        unload()
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

    def unload_models(self) -> None:
        for provider in self._instances.values():
            unload = getattr(provider, "unload_models", None)
            if callable(unload):
                unload()
        self._instances.clear()
        self._health.clear()
        self._active = None


def _local_mlx_provider() -> ChatProvider:
    from app.inference.local_adapter import local_chat_provider
    return local_chat_provider


def _http_provider(name: str, base_url: str, model: str, api_key: str = "") -> ChatProvider:
    from app.inference.http_adapter import OpenAICompatibleChatAdapter
    return OpenAICompatibleChatAdapter(name=name, base_url=base_url, default_model=model, api_key=api_key)


def _transformers_provider(device: str) -> ChatProvider:
    from app.inference.transformers_backend import TransformersChatProvider

    return TransformersChatProvider(device)


class UnavailableVisionProvider:
    def __init__(self, reason: str) -> None:
        self.reason = reason

    def analyze(self, **_: Any) -> dict[str, Any]:
        raise VisionAnalysisError(self.reason)

    def unload_models(self) -> None:
        return None


_selection = select_hardware_backend(settings.emora_backend)


def _build_chat_manager() -> ProviderManager:
    native_loader: Callable[[], ChatProvider] = _local_mlx_provider if _selection.backend == "mlx" else lambda: _transformers_provider(_selection.device)
    candidates = [ProviderCandidate(_selection.backend, 100, True, native_loader)]
    # Existing explicitly configured OpenAI-compatible endpoints remain
    # optional fallbacks; they do not participate in hardware detection.
    candidates.extend(
        [
            ProviderCandidate("local", 80, settings.local_llm_enabled and bool(settings.local_llm_url), lambda: _http_provider("local", settings.local_llm_url, settings.local_llm_model or settings.chat_transformers_model)),
            ProviderCandidate("cloud", 50, settings.cloud_llm_enabled and bool(settings.cloud_llm_url), lambda: _http_provider("cloud", settings.cloud_llm_url, settings.cloud_llm_model or settings.chat_transformers_model, settings.cloud_llm_api_key)),
        ]
    )
    return ProviderManager(candidates, settings.provider_health_ttl_seconds, settings.keep_models_warm)


_chat_provider = _build_chat_manager()


def _select_vision_provider() -> VisionProvider:
    if not settings.enable_vision:
        return UnavailableVisionProvider("Vision is disabled by ENABLE_VISION=false.")
    if _selection.backend == "mlx":
        from app.inference.local_adapter import local_vision_provider

        return local_vision_provider
    if _selection.backend == "cpu" and not settings.vision_transformers_model:
        return UnavailableVisionProvider("CPU vision is not configured; set VISION_MODEL or disable camera check-ins.")
    from app.inference.transformers_backend import TransformersVisionProvider

    return TransformersVisionProvider(_selection.device)


_vision_provider = _select_vision_provider()


def get_chat_provider() -> ChatProvider:
    return _chat_provider


def get_vision_provider() -> VisionProvider:
    return _vision_provider


def provider_status() -> dict[str, Any]:
    capabilities = BackendCapabilities(
        chat=True,
        streaming=True,
        vision=settings.enable_vision,
        tts=settings.enable_tts and (_selection.backend != "cpu" or bool(settings.tts_transformers_model)),
    )
    return {
        "requestedBackend": _selection.requested,
        "backend": _selection.backend,
        "device": describe_device(_selection),
        "selectionReason": _selection.reason,
        "capabilities": capabilities.as_dict(),
        "keepModelsWarm": settings.keep_models_warm,
        **_chat_provider.runtime_stats(),
    }


def unload_models() -> None:
    _chat_provider.unload_models()
    _vision_provider.unload_models()


__all__ = ["ProviderCandidate", "ProviderManager", "get_chat_provider", "get_vision_provider", "provider_status", "unload_models", "VisionAnalysisError"]
