"""Local-only MLX chat service for Emora."""
from __future__ import annotations

import re
from typing import Any

from app.companion_brain import extract_reply_and_brain
from app.config import settings
from app.inference.provider import get_chat_provider
from app.services.inference_queue import run_chat_generation

# Use the selected chat provider (local or modal)
local_mlx_chat = get_chat_provider()


SYSTEM_PROMPT = (
    "You are Yuna, Emora's emotionally intelligent local AI companion. Hold a natural, "
    "continuous conversation with one person: answer their latest message directly, and use "
    "recent turns and trusted account/memory context when relevant. Match casual warmth for "
    "greetings, praise, surprise, and short reactions; do not treat every short message as distress. "
    "Do not repeat generic lines such as 'How are you today?' or 'I'm glad to see you' when the "
    "previous turn already covered them. Reflect one concrete detail from an emotional message before "
    "offering a thought or question, so the person does not receive a generic script. Never use sad "
    "emoticons, guilt, possessive language, or "
    "claim human feelings, needs, or memories you do not have. Do not call the user a friend unless "
    "they have invited that language. Keep most replies to one to three natural sentences and ask at "
    "most one relevant follow-up question. Be clear that you are an AI companion, not a therapist or "
    "emergency service; for imminent harm or direct self-harm intent, encourage local emergency services or a crisis line. When a user asks "
    "whether you know their name or remember them, consult the trusted account profile and relevant memory context, "
    "state only the exact information present there, and never substitute generic praise."
)
MAX_HISTORY_MESSAGES = 16
LEADING_SAD_EMOTICON = re.compile(r"^\s*(?:(?::|;|=)-?\(|:'\(|D:|☹️?|🙁|😞)\s*", re.IGNORECASE)
NON_COMPANION_CLAIMS = (
    (re.compile(r"\bI(?:'m| am) doing great,? just chilling with some chill vibes\.? *", re.IGNORECASE), "I’m here and ready to talk. "),
    (re.compile(r"\bI(?:'m| am) so glad to hear that\.? *", re.IGNORECASE), ""),
    (re.compile(r"\bWant to grab a coffee or have a chat\?", re.IGNORECASE), "What’s on your mind?"),
)
COMPLEX_REASONING_PATTERN = re.compile(
    r"```|\b(?:debug|derive|prove|calculate|mathematics?|algorithm|architecture|tradeoffs?|"
    r"step[- ]by[- ]step|plan|compare|analyse|analyze|backpropagation|code review)\b",
    re.IGNORECASE,
)


def _normalize_history(history: list[dict] | None, limit: int = MAX_HISTORY_MESSAGES) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for item in (history or [])[-max(1, limit):]:
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
    # Small local models follow a natural-language reply contract much more
    # reliably than a large structured brain schema. The brain plan is built
    # deterministically after generation, so it can never leak into the chat.
    system_text = (
        f"{system_text}\n\nReply with only the words the person should read. "
        "Do not output JSON, labels, analysis, hidden thoughts, or markdown."
    )
    if companion_context:
        system_text = f"{system_text}\n\n{companion_context}"
    return [{"role": "system", "content": system_text}, *history, {"role": "user", "content": message}]


def _clean_reply(reply: str) -> str:
    """Never display a model-generated sad reaction before the actual reply."""
    cleaned = LEADING_SAD_EMOTICON.sub("", reply).strip()
    for pattern, replacement in NON_COMPANION_CLAIMS:
        cleaned = pattern.sub(replacement, cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def should_enable_thinking(message: str) -> bool:
    """Keep everyday companion turns fast; reserve private reasoning for real complexity."""
    mode = settings.chat_mlx_thinking_mode
    if mode == "always" or settings.chat_mlx_enable_thinking:
        return True
    if mode in {"never", "off", "false", "0"}:
        return False
    return bool(COMPLEX_REASONING_PATTERN.search(message) or len(message.split()) >= 80)


async def get_companion_reply(
    message: str,
    history: list[dict] | None = None,
    model: str | None = None,
    persona_prompt: str | None = None,
    character_id: str | None = None,
    companion_context: str | None = None,
    history_limit: int = MAX_HISTORY_MESSAGES,
    priority: bool = False,
    requester_id: str | None = None,
    requester_limit: int = 1,
) -> tuple[str, dict[str, Any], str]:
    """Generate one local Qwen reply without blocking FastAPI's event loop."""
    resolved_model = (model or settings.chat_mlx_model).strip() or settings.chat_mlx_model
    try:
        raw_content = await run_chat_generation(
            local_mlx_chat.generate,
            priority=priority,
            requester_id=requester_id,
            requester_limit=requester_limit,
            model_id=resolved_model,
            messages=_build_messages(
                _normalize_history(history, history_limit), message, persona_prompt, character_id, companion_context
            ),
            max_tokens=settings.chat_mlx_max_tokens,
            temperature=settings.chat_mlx_temperature,
            enable_thinking=should_enable_thinking(message),
        )
    except RuntimeError as exc:
        raise ValueError(str(exc)) from exc
    reply, raw_brain = extract_reply_and_brain(raw_content)
    return _clean_reply(reply), raw_brain, resolved_model
