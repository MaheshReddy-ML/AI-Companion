from __future__ import annotations

import json
from typing import Any, Iterator
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class OpenAICompatibleChatAdapter:
    """Dependency-free adapter for local or cloud OpenAI-compatible APIs."""

    def __init__(self, *, name: str, base_url: str, default_model: str, api_key: str = ""):
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model
        self.api_key = api_key
        self._last_model = default_model

    def _request(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.base_url:
            raise RuntimeError(f"{self.name} URL is not configured")
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = Request(f"{self.base_url}/chat/completions", data=json.dumps(payload).encode(), headers=headers, method="POST")
        try:
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode())
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"{self.name} request failed: {exc}") from exc

    def generate(self, *, model_id: str, messages: list[dict[str, Any]], max_tokens: int, temperature: float, enable_thinking: bool = True, tools: list[dict[str, Any]] | None = None) -> str:
        model = self.default_model or model_id
        payload: dict[str, Any] = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature, "stream": False}
        if tools:
            payload["tools"] = tools
        data = self._request(payload)
        try:
            message = data["choices"][0]["message"]
            self._last_model = model
            if message.get("tool_calls"):
                call = message["tool_calls"][0]["function"]
                return f'<tool_call>{{"name":{json.dumps(call["name"])},"arguments":{call.get("arguments", "{}")}}}</tool_call>'
            return str(message.get("content") or "")
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError(f"{self.name} returned an invalid chat response") from exc

    def stream(self, **kwargs: Any) -> Iterator[str]:
        yield self.generate(**kwargs)

    def health_check(self) -> tuple[bool, str]:
        configured = bool(self.base_url and self.default_model)
        return configured, "configured" if configured else "not configured"

    def runtime_stats(self) -> dict[str, Any]:
        return {"provider": self.name, "model": self._last_model, "remote": True}

    def unload_models(self) -> None:
        return None
