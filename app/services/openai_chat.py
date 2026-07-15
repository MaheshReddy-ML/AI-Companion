from __future__ import annotations

import inspect
from typing import Any

from app.companion_brain import companion_brain_system_prompt, extract_reply_and_brain
from app.config import settings


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


def _build_messages(
    history: list[dict],
    message: str,
    persona_prompt: str | None,
    brain_prompt: str | None = None,
    companion_context: str | None = None,
) -> list[dict]:
    system_text = SYSTEM_PROMPT
    if persona_prompt and persona_prompt.strip():
        system_text = f"{SYSTEM_PROMPT}\n\n{persona_prompt.strip()}"
    if brain_prompt:
        system_text = f"{system_text}\n\n{brain_prompt}"
    if companion_context:
        system_text = f"{system_text}\n\n{companion_context}"

    return [
        {"role": "system", "content": system_text},
        *history,
        {"role": "user", "content": message},
    ]


def _extract_text(response: Any) -> str:
    choices = getattr(response, "choices", None) or []
    if not choices:
        return ""

    message = getattr(choices[0], "message", None)
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            text_value = getattr(item, "text", None)
            if text_value:
                parts.append(str(text_value))
                continue

            if isinstance(item, dict):
                nested_text = item.get("text")
                if isinstance(nested_text, str) and nested_text.strip():
                    parts.append(nested_text)
        return "".join(parts).strip()

    return str(content or "").strip()


async def _close_client(client: Any) -> None:
    close_method = getattr(client, "close", None)
    if not callable(close_method):
        return

    result = close_method()
    if inspect.isawaitable(result):
        await result


async def get_openai_reply(
    message: str,
    history: list[dict] | None = None,
    model: str | None = None,
    api_key: str | None = None,
    persona_prompt: str | None = None,
    character_id: str | None = None,
    companion_context: str | None = None,
) -> tuple[str, str]:
    try:
        from openai import AsyncOpenAI
    except ImportError as exc:
        raise ValueError("OpenAI support is not installed. Run `pip install -r requirements.txt`.") from exc

    resolved_key = (api_key or settings.openai_api_key).strip()
    if not resolved_key:
        raise ValueError("OPENAI_API_KEY is required for chat replies.")

    resolved_model = (model or settings.openai_model).strip() or settings.openai_model
    resolved_base_url = settings.openai_base_url.strip() or "https://models.inference.ai.azure.com/"
    normalized_history = _normalize_history(history)
    client = AsyncOpenAI(
        api_key=resolved_key,
        base_url=resolved_base_url,
        timeout=30.0,
    )

    try:
        messages = _build_messages(
            normalized_history,
            message,
            persona_prompt,
            companion_brain_system_prompt(character_id or "yuna"),
            companion_context,
        )
        try:
            response = await client.chat.completions.create(
                model=resolved_model,
                messages=messages,
                response_format={"type": "json_object"},
            )
        except Exception:
            response = await client.chat.completions.create(
                model=resolved_model,
                messages=messages,
            )
    except Exception as exc:
        raise ValueError(str(exc) or "OpenAI request failed.") from exc
    finally:
        await _close_client(client)

    content = _extract_text(response)
    if not content:
        raise ValueError("OpenAI returned an empty response.")

    return content, resolved_model


async def get_openai_companion_reply(
    message: str,
    history: list[dict] | None = None,
    model: str | None = None,
    api_key: str | None = None,
    persona_prompt: str | None = None,
    character_id: str | None = None,
    companion_context: str | None = None,
) -> tuple[str, dict[str, Any], str]:
    raw_content, resolved_model = await get_openai_reply(
        message=message,
        history=history,
        model=model,
        api_key=api_key,
        persona_prompt=persona_prompt,
        character_id=character_id,
        companion_context=companion_context,
    )
    reply, raw_brain = extract_reply_and_brain(raw_content)
    return reply, raw_brain, resolved_model
