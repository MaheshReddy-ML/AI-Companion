"""Adapter exposing existing local MLX providers through the new inference API.

This module intentionally wraps the existing `local_mlx_chat` and
`local_mlx_vision` objects without changing them.
"""
from __future__ import annotations

from typing import Any
import importlib.util
from pathlib import Path

from huggingface_hub import try_to_load_from_cache

from app.config import settings
from app.inference.base import ChatProvider, VisionProvider, VisionAnalysisError
from app.services.local_mlx_chat import local_mlx_chat
from app.services.local_mlx_vision import local_mlx_vision


class LocalChatAdapter:
    def generate(self, *, model_id: str, messages: list[dict[str, Any]], max_tokens: int, temperature: float, enable_thinking: bool = True, tools: list[dict[str, Any]] | None = None) -> str:
        return local_mlx_chat.generate(model_id=model_id, messages=messages, max_tokens=max_tokens, temperature=temperature, enable_thinking=enable_thinking, tools=tools)

    def runtime_stats(self) -> dict[str, Any]:
        return {"provider": "mlx", **local_mlx_chat.runtime_stats()}

    def health_check(self) -> tuple[bool, str]:
        if importlib.util.find_spec("mlx_lm") is None:
            return False, "mlx_lm is not installed"
        model_id = settings.chat_mlx_model.strip()
        if not model_id:
            return False, "MLX model is not configured"
        local_model = Path(model_id).expanduser()
        cached_config = local_model / "config.json" if local_model.exists() else try_to_load_from_cache(model_id, "config.json")
        if not cached_config or not Path(str(cached_config)).is_file():
            return False, "configured MLX model is not available locally"
        return True, "MLX runtime and configured model are available; inference is verified on first use"

    def stream(self, **kwargs: Any):
        yield self.generate(**kwargs)


class LocalVisionAdapter:
    def analyze(self, *, model_id: str, data_url: str, max_tokens: int) -> dict[str, Any]:
        try:
            return local_mlx_vision.analyze(model_id=model_id, data_url=data_url, max_tokens=max_tokens)
        except Exception as exc:
            # Wrap provider-specific errors so callers can import a single
            # `VisionAnalysisError` from the inference layer.
            raise VisionAnalysisError(str(exc)) from exc


local_chat_provider = LocalChatAdapter()
local_vision_provider = LocalVisionAdapter()
