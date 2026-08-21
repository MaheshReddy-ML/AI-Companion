from __future__ import annotations

from app.config import settings
from app.inference.base import ChatProvider, VisionProvider, VisionAnalysisError


def _select_providers() -> tuple[ChatProvider, VisionProvider]:
    mode = (settings.inference_provider or "local").strip().lower()
    if mode == "modal":
        try:
            from app.inference.modal_gpu import modal_chat_provider, modal_vision_provider
        except Exception as exc:
            raise RuntimeError(f"Modal provider requested but could not be imported: {exc}") from exc
        return modal_chat_provider, modal_vision_provider

    # default to local
    try:
        from app.inference.local_adapter import local_chat_provider, local_vision_provider
    except Exception as exc:
        raise RuntimeError(f"Local MLX adapters could not be loaded: {exc}") from exc
    return local_chat_provider, local_vision_provider


_chat_provider, _vision_provider = _select_providers()


def get_chat_provider() -> ChatProvider:
    return _chat_provider


def get_vision_provider() -> VisionProvider:
    return _vision_provider


# Re-export VisionAnalysisError so callers can import from a single place.
__all__ = ["get_chat_provider", "get_vision_provider", "VisionAnalysisError"]
