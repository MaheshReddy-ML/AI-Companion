"""Adapter exposing existing local MLX providers through the new inference API.

This module intentionally wraps the existing `local_mlx_chat` and
`local_mlx_vision` objects without changing them.
"""
from __future__ import annotations

from typing import Any

from app.inference.base import ChatProvider, VisionProvider, VisionAnalysisError
from app.services.local_mlx_chat import local_mlx_chat
from app.services.local_mlx_vision import local_mlx_vision


class LocalChatAdapter:
    def generate(self, *, model_id: str, messages: list[dict[str, str]], max_tokens: int, temperature: float, enable_thinking: bool = True) -> str:
        return local_mlx_chat.generate(model_id=model_id, messages=messages, max_tokens=max_tokens, temperature=temperature, enable_thinking=enable_thinking)

    def runtime_stats(self) -> dict[str, Any]:
        return local_mlx_chat.runtime_stats()


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
