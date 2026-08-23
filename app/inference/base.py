from __future__ import annotations

from typing import Any, Protocol


class ChatProvider(Protocol):
    def generate(self, *, model_id: str, messages: list[dict[str, Any]], max_tokens: int, temperature: float, enable_thinking: bool = True, tools: list[dict[str, Any]] | None = None) -> str: ...

    def runtime_stats(self) -> dict[str, Any]: ...


class VisionProvider(Protocol):
    def analyze(self, *, model_id: str, data_url: str, max_tokens: int) -> dict[str, Any]: ...


class VisionAnalysisError(RuntimeError):
    pass
