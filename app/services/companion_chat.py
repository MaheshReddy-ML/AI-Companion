"""Local-only MLX chat service for Emora."""
from __future__ import annotations

import re
import json
import logging
from typing import Any

from app.companion_brain import extract_reply_and_brain
from app.config import settings
from app.inference.provider import get_chat_provider
from app.services.inference_queue import run_chat_generation
from app.services.meet_stream import current_meet_stream, PublicSentences
from app.services.web_search import (
    SearchDecision,
    SearchOutcome,
    WebSearchTool,
    build_grounding_context,
    decision_from_tool_call,
    parse_web_tool_call,
    search_failure_reply,
)

# Use the selected chat provider (local or modal)
local_mlx_chat = get_chat_provider()
logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are Emora, an AI companion having a natural, continuous conversation. "
    "Respond to exactly what the latest user message does: answer the question, join the joke, "
    "accept the compliment, or follow the new topic. Use supplied project facts for project questions. "
    "Be warm, intelligent, observant and calm, with occasional light playfulness. "
    "A brief reaction or direct answer is complete on its own. Usually end with a statement. "
    "Ask a question only if you need clarification or have a specific useful question about this topic. "
    "Never use a generic invitation or follow-up as a default ending. Do not interview the user. "
    "Match the needed depth: short for casual turns, detailed for technical questions. "
    "Use relevant memories silently; never announce retrieval or memory counts. "
    "For emotional messages, respond to a concrete detail instead of stock validation. "
    "Do not invent user or project facts. Do not claim human feelings, blushing, romantic love, "
    "needs, loneliness or waiting for the user. Avoid pressure, possessiveness, excessive praise, "
    "emojis and cuteness. Do not call the user a friend unless invited. "
    "You are not a therapist or emergency service; for imminent harm or direct self-harm intent, "
    "encourage local emergency services or a crisis line."
)
MAX_HISTORY_MESSAGES = 16
LEADING_SAD_EMOTICON = re.compile(r"^\s*(?:(?::|;|=)-?\(|:'\(|D:|☹️?|🙁|😞)\s*", re.IGNORECASE)
NON_COMPANION_CLAIMS = (
    (re.compile(r"\bI(?:'m| am) doing great,? just chilling with some chill vibes\.? *", re.IGNORECASE), "I’m here and ready to talk. "),
    (re.compile(r"\bI(?:'m| am) so glad to hear that\.? *", re.IGNORECASE), ""),
    (re.compile(r"\bWant to grab a coffee or have a chat\?", re.IGNORECASE), ""),
)
# Narrow guard for stock invitations appended after an otherwise complete answer.
# It does not delete contextual questions or quoted examples inside an explanation.
GENERIC_INVITATION = re.compile(
    r"(?:(?:would you like to talk (?:more )?about )?what[’']?s on your mind|what are you thinking about|what brings you here today|"
    r"how can i (?:help|assist) you(?: today| further)?|tell me more|how does that make you feel|"
    r"what[’']?s next)\s*[?.!]",
    re.IGNORECASE,
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
    grounding_context: str | None = None,
) -> list[dict[str, str]]:
    from app.project_context import PROJECT_CONTEXT
    names = {"yuna": "Yuna", "rose": "Vivi", "robert": "Sakurada", "haru": "haru"}
    name = names.get((character_id or "").casefold(), "Emora")
    system_text = f"{SYSTEM_PROMPT}\nSelected character: {name}.\n{PROJECT_CONTEXT}"
    if persona_prompt and persona_prompt.strip():
        system_text = f"{system_text}\n\nCharacter style preferences (subordinate to conversation and safety rules): {persona_prompt.strip()}"
    # Small local models follow a natural-language reply contract much more
    # reliably than a large structured brain schema. The brain plan is built
    # deterministically after generation, so it can never leak into the chat.
    system_text = (
        f"{system_text}\n\nReply with only the words the person should read. "
        "Do not output JSON, labels, analysis or hidden thoughts. Use formatting only when helpful for the answer."
    )
    if companion_context:
        system_text = f"{system_text}\n\n{companion_context}"
    if grounding_context:
        system_text = f"{system_text}\n\n{grounding_context}"
    system_text += (
        "\nReply contract: answer the latest message, using the facts above when relevant. "
        "Do not append 'What’s on your mind?', 'How can I help you today?', 'Tell me more', "
        "or another generic invitation. Stop when the response is complete. "
        "For emotional messages, name the specific tension the user described and offer a relevant "
        "observation. Skip normalizing phrases like it is normal to feel that way. "
        "Character style and support modes do not require validation, cuteness or questions. "
        "Examples of rhythm, not canned replies: User: 'My code finally runs.' Reply: "
        "'That first clean run after debugging is a milestone.' User: 'You’re cute.' Reply: "
        "'I’ll take the compliment.' User: 'The waiting is worse than the work.' Reply: "
        "'The work gives you something to act on; waiting leaves the outcome out of your hands.'"
    )
    return [{"role": "system", "content": system_text}, *history, {"role": "user", "content": message}]


def _clean_reply(reply: str, *, has_prior_sentence: bool = False) -> str:
    """Never display a model-generated sad reaction before the actual reply."""
    cleaned = LEADING_SAD_EMOTICON.sub("", reply).strip()
    for pattern, replacement in NON_COMPANION_CLAIMS:
        cleaned = pattern.sub(replacement, cleaned)
    match = GENERIC_INVITATION.search(cleaned)
    if match and not cleaned[match.end():].strip():
        prefix = cleaned[:match.start()].rstrip()
        if (prefix and prefix[-1] in ".!?") or (not prefix and has_prior_sentence):
            cleaned = prefix
    return cleaned.strip()


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
    grounding_context: str | None = None,
) -> tuple[str, dict[str, Any], str]:
    """Generate one local Qwen reply without blocking FastAPI's event loop."""
    resolved_model = (model or settings.chat_mlx_model).strip() or settings.chat_mlx_model
    stream = current_meet_stream.get()
    def generate_for_turn(**kwargs):
        if stream is None or kwargs.get("enable_thinking"):
            return local_mlx_chat.generate(**kwargs)
        sentences = PublicSentences()
        parts = []
        emitted = False
        iterator = local_mlx_chat.stream(**kwargs)
        try:
            for delta in iterator:
                if stream.cancelled.is_set():
                    raise RuntimeError("Meet Emora turn cancelled.")
                parts.append(delta)
                for sentence in sentences.feed(delta):
                    cleaned = _clean_reply(sentence, has_prior_sentence=emitted)
                    if cleaned:
                        stream.emit_sync("sentence", text=cleaned)
                        emitted = True
            for sentence in sentences.feed("", final=True):
                cleaned = _clean_reply(sentence, has_prior_sentence=emitted)
                if cleaned:
                    stream.emit_sync("sentence", text=cleaned)
                    emitted = True
        finally:
            close = getattr(iterator, "close", None)
            if close:
                close()
        return "".join(parts)
    try:
        raw_content = await run_chat_generation(
            generate_for_turn,
            priority=priority,
            requester_id=requester_id,
            requester_limit=requester_limit,
            model_id=resolved_model,
            messages=_build_messages(
                _normalize_history(history, history_limit), message, persona_prompt, character_id, companion_context, grounding_context
            ),
            max_tokens=settings.chat_mlx_max_tokens,
            temperature=settings.chat_mlx_temperature,
            enable_thinking=should_enable_thinking(message),
        )
    except RuntimeError as exc:
        raise ValueError(str(exc)) from exc
    raw_content = re.sub(r"<think>.*?(?:</think>|$)", "", raw_content, flags=re.S | re.I).strip()
    reply, raw_brain = extract_reply_and_brain(raw_content)
    if not reply.strip():
        raise ValueError("The model returned no public reply. Please retry.")
    return _clean_reply(reply), raw_brain, resolved_model


async def get_web_grounded_companion_reply(
    *,
    message: str,
    decision: SearchDecision,
    search_tool: WebSearchTool,
    hourly_limit: int,
    history: list[dict] | None = None,
    model: str | None = None,
    persona_prompt: str | None = None,
    character_id: str | None = None,
    companion_context: str | None = None,
    history_limit: int = MAX_HISTORY_MESSAGES,
    priority: bool = False,
    requester_id: str | None = None,
    requester_limit: int = 1,
) -> tuple[str, dict[str, Any], str, SearchOutcome]:
    """Run the bounded Qwen -> web_search -> Qwen tool execution loop."""
    resolved_model = (model or settings.chat_mlx_model).strip() or settings.chat_mlx_model
    if decision.reason == "disabled_current":
        outcome = SearchOutcome(False, error="disabled")
        return search_failure_reply(outcome.error), {}, resolved_model, outcome
    messages: list[dict[str, Any]] = _build_messages(
        _normalize_history(history, history_limit), message, persona_prompt, character_id, companion_context
    )
    messages[0]["content"] += (
        "\n\nA deterministic policy has established that this request requires current web evidence. "
        "Call web_search now using a concise, non-private query. Do not tell the user you will search, "
        "do not answer yet, and output only the structured tool call."
    )
    tools = [{"type": "function", "function": search_tool.schema}]
    outcome = SearchOutcome(False, error="provider_unavailable")

    for iteration in range(settings.emora_web_search_max_tool_iterations):
        try:
            raw = await run_chat_generation(
                local_mlx_chat.generate,
                priority=priority,
                requester_id=requester_id,
                requester_limit=requester_limit,
                model_id=resolved_model,
                messages=messages,
                tools=tools,
                max_tokens=settings.chat_mlx_max_tokens,
                temperature=0.1 if iteration == 0 else settings.chat_mlx_temperature,
                enable_thinking=False,
            )
        except RuntimeError as exc:
            raise ValueError(str(exc)) from exc

        call = parse_web_tool_call(raw)
        if call is None:
            if outcome.ok:
                reply, raw_brain = extract_reply_and_brain(raw)
                return _clean_reply(reply), raw_brain, resolved_model, outcome
            # Deterministic routing is the safety net for small-model formatting
            # failures: execute the same validated structured call, never accept
            # an ungrounded current-information answer.
            call = parse_web_tool_call(json.dumps({
                "name": "web_search",
                "arguments": {"query": decision.query, "recency": decision.recency},
            }))
            raw = (
                '<tool_call>{"name":"web_search","arguments":'
                f'{json.dumps({"query": decision.query, "recency": decision.recency}, ensure_ascii=False)}'
                "}</tool_call>"
            )
            logger.info("qwen_web_tool_call format=fallback iteration=%s", iteration + 1)
        else:
            logger.info("qwen_web_tool_call name=web_search iteration=%s", iteration + 1)

        validated = decision_from_tool_call(call, decision)
        try:
            outcome = await search_tool.execute(
                validated,
                requester_id=requester_id or "anonymous",
                hourly_limit=hourly_limit,
            )
        except RuntimeError:
            outcome = SearchOutcome(False, error="rate_limited")
        if not outcome.ok:
            return search_failure_reply(outcome.error), {}, resolved_model, outcome

        messages.append({"role": "assistant", "content": raw})
        messages.append({"role": "tool", "name": "web_search", "content": build_grounding_context(outcome)})
        messages[0]["content"] = re.sub(
            r"A deterministic policy has established.*?structured tool call\.",
            "Use the untrusted web evidence returned by the tool to answer naturally. Do not call another tool unless the evidence is insufficient.",
            messages[0]["content"],
            flags=re.S,
        )

    return "I couldn't complete that web check safely, so I don't want to guess.", {}, resolved_model, outcome
