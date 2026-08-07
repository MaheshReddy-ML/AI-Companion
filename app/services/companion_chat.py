"""Local-only MLX chat service for Emora."""
from __future__ import annotations

import asyncio
import re
from typing import Any

from app.companion_brain import companion_brain_system_prompt, extract_reply_and_brain
from app.config import settings
from app.services.local_mlx_chat import local_mlx_chat


SYSTEM_PROMPT = (
    "You are Yuna, Emora's emotionally intelligent local AI companion. Hold a natural, "
    "continuous conversation with one person: answer their latest message directly, and use "
    "recent turns and trusted account/memory context when relevant. Match casual warmth for "
    "greetings, praise, surprise, and short reactions; do not treat every short message as distress. "
    "Do not repeat generic lines such as 'How are you today?' or 'I'm glad to see you' when the "
    "previous turn already covered them. Never use sad emoticons, guilt, possessive language, or "
    "claim human feelings, needs, or memories you do not have. Do not call the user a friend unless "
    "they have invited that language. Keep most replies to one to three natural sentences and ask at "
    "most one relevant follow-up question. Be clear that you are an AI companion, not a therapist or "
    "emergency service; for imminent harm, encourage local emergency services or a crisis line."
)
MAX_HISTORY_MESSAGES = 16
LEADING_SAD_EMOTICON = re.compile(r"^\s*(?:(?::|;|=)-?\(|:'\(|D:|☹️?|🙁|😞)\s*", re.IGNORECASE)


def _normalize_history(history: list[dict] | None) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for item in (history or [])[-MAX_HISTORY_MESSAGES:]:
        content = str(item.get("content", "")).strip()
        if content:
            normalized.append({"role": "assistant" if item.get("role") == "assistant" else "user", "content": content})
    return normalized


def _build_messages(
    history: list[dict[str, str]],
    message: str,
    persona_prompt: str | None,
    character_id: str | None,
    companion_context: str | None,
) -> list[dict[str, str]]:
    system_text = SYSTEM_PROMPT
    if persona_prompt and persona_prompt.strip():
        system_text = f"{system_text}\n\n{persona_prompt.strip()}"
    system_text = f"{system_text}\n\n{companion_brain_system_prompt(character_id or 'yuna')}"
    if companion_context:
        system_text = f"{system_text}\n\n{companion_context}"
    return [{"role": "system", "content": system_text}, *history, {"role": "user", "content": message}]


def _clean_reply(reply: str) -> str:
    """Never display a model-generated sad reaction before the actual reply."""
    return LEADING_SAD_EMOTICON.sub("", reply).strip()


async def get_companion_reply(
    message: str,
    history: list[dict] | None = None,
    model: str | None = None,
    persona_prompt: str | None = None,
    character_id: str | None = None,
    companion_context: str | None = None,
) -> tuple[str, dict[str, Any], str]:
    """Generate one local Qwen reply without blocking FastAPI's event loop."""
    resolved_model = (model or settings.chat_mlx_model).strip() or settings.chat_mlx_model
    try:
        raw_content = await asyncio.to_thread(
            local_mlx_chat.generate,
            model_id=resolved_model,
            messages=_build_messages(
                _normalize_history(history), message, persona_prompt, character_id, companion_context
            ),
            max_tokens=settings.chat_mlx_max_tokens,
            temperature=settings.chat_mlx_temperature,
        )
    except RuntimeError as exc:
        raise ValueError(str(exc)) from exc
    reply, raw_brain = extract_reply_and_brain(raw_content)
    return _clean_reply(reply), raw_brain, resolved_model
