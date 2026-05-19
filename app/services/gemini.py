from __future__ import annotations

import httpx

from app.config import settings


GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
SYSTEM_PROMPT = (
    "You are AI Companion, a practical and supportive assistant. "
    "Keep responses concise, clear, and actionable."
)
MAX_HISTORY_MESSAGES = 16


def _normalize_history(history: list[dict] | None) -> list[dict]:
    if not history:
        return []

    normalized: list[dict] = []
    for item in history[-MAX_HISTORY_MESSAGES:]:
        role = "assistant" if item.get("role") == "assistant" else "user"
        content = str(item.get("content", "")).strip()
        if content:
            normalized.append({"role": role, "content": content})
    return normalized


def _build_contents(history: list[dict], message: str) -> list[dict]:
    history_contents = [
        {
            "role": "model" if item["role"] == "assistant" else "user",
            "parts": [{"text": item["content"]}],
        }
        for item in history
    ]
    return [*history_contents, {"role": "user", "parts": [{"text": message}]}]


def _extract_text(payload: dict) -> str:
    candidates = payload.get("candidates", [])
    if not candidates:
        return ""

    parts = candidates[0].get("content", {}).get("parts", [])
    return "".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()


async def get_gemini_reply(
    message: str,
    history: list[dict] | None = None,
    model: str | None = None,
    api_key: str | None = None,
    persona_prompt: str | None = None,
) -> tuple[str, str]:
    resolved_key = (api_key or settings.gemini_api_key).strip()
    if not resolved_key:
        raise ValueError("Gemini API key is required.")

    resolved_model = (model or settings.gemini_model).strip() or settings.gemini_model
    normalized_history = _normalize_history(history)
    system_text = SYSTEM_PROMPT
    if persona_prompt and persona_prompt.strip():
        system_text = f"{SYSTEM_PROMPT}\n\n{persona_prompt.strip()}"

    endpoint = f"{GEMINI_API_BASE_URL}/{resolved_model}:generateContent?key={resolved_key}"
    payload = {
        "systemInstruction": {"parts": [{"text": system_text}]},
        "contents": _build_contents(normalized_history, message),
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(endpoint, json=payload)

    if response.status_code >= 400:
        try:
            data = response.json()
            message_text = data.get("error", {}).get("message") or data.get("message") or "Gemini request failed"
        except Exception:
            message_text = "Gemini request failed"
        raise ValueError(message_text)

    data = response.json()
    content = _extract_text(data)
    if not content:
        raise ValueError("Gemini returned an empty response.")

    return content, resolved_model
