from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Iterator, Protocol


@dataclass(frozen=True, slots=True)
class BackendCapabilities:
    chat: bool = True
    streaming: bool = True
    vision: bool = False
    tts: bool = False

    def as_dict(self) -> dict[str, bool]:
        return asdict(self)


class ChatProvider(Protocol):
    def generate(self, *, model_id: str, messages: list[dict[str, Any]], max_tokens: int, temperature: float, enable_thinking: bool = True, tools: list[dict[str, Any]] | None = None) -> str: ...

    def runtime_stats(self) -> dict[str, Any]: ...

    def health_check(self) -> tuple[bool, str]: ...

    def stream(self, **kwargs: Any) -> Iterator[str]: ...

    def unload_models(self) -> None: ...


class VisionProvider(Protocol):
    def analyze(self, *, model_id: str, data_url: str, max_tokens: int) -> dict[str, Any]: ...

    def unload_models(self) -> None: ...


class VisionAnalysisError(RuntimeError):
    pass


class CapabilityUnavailableError(RuntimeError):
    """Raised when the selected backend deliberately does not offer a feature."""


__all__ = [
    "BackendCapabilities",
    "CapabilityUnavailableError",
    "ChatProvider",
    "VisionAnalysisError",
    "VisionProvider",
]
