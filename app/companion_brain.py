from __future__ import annotations

import json
import math
import random
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Literal


AttentionState = Literal["idle", "listening", "thinking", "responding", "curious", "reflecting", "excited"]
BehaviorState = Literal["Idle", "Listening", "Thinking", "Speaking", "Reacting", "Reflecting"]


CHARACTER_PERSONALITIES: dict[str, dict[str, float]] = {
    "yuna": {"warmth": 0.92, "formality": 0.28, "humor": 0.34, "enthusiasm": 0.58, "energy": 0.52, "assertiveness": 0.42, "curiosity": 0.66},
    "rose": {"warmth": 0.86, "formality": 0.18, "humor": 0.68, "enthusiasm": 0.82, "energy": 0.78, "assertiveness": 0.46, "curiosity": 0.86},
    "robert": {"warmth": 0.62, "formality": 0.72, "humor": 0.22, "enthusiasm": 0.38, "energy": 0.46, "assertiveness": 0.78, "curiosity": 0.48},
    "haru": {"warmth": 0.78, "formality": 0.22, "humor": 0.62, "enthusiasm": 0.54, "energy": 0.48, "assertiveness": 0.44, "curiosity": 0.58},
}


@dataclass
class EmotionalVector:
    valence: float = 0.58
    arousal: float = 0.42
    dominance: float = 0.48
    confidence: float = 0.68
    curiosity: float = 0.5
    engagement: float = 0.78
    empathy: float = 0.72


@dataclass
class InternalThought:
    thinkingDurationMs: int = 700
    hesitationMs: int = 80
    reflectionDepth: float = 0.35
    responseConfidence: float = 0.68
    preSpeechBehavior: BehaviorState = "Thinking"


@dataclass
class BehaviorPlan:
    state: BehaviorState = "Speaking"
    attentionState: AttentionState = "responding"
    eyeContact: float = 0.72
    blinkRate: float = 0.52
    headTilt: float = 0.0
    gestureIntensity: float = 0.34
    gestureTempo: float = 0.44
    reactionDelayMs: int = 220
    microUncertainty: float = 0.16
    recognition: float = 0.0


@dataclass
class SpeechPlan:
    style: str = "warm"
    speed: float = 1.0
    pauseFrequency: float = 0.28
    pauseScale: float = 1.0
    emphasis: list[str] = field(default_factory=list)
    vocalEnergy: float = 0.5
    emotionalIntensity: float = 0.42
    confidence: float = 0.68
    markupText: str = ""


@dataclass
class CompanionBrainOutput:
    schemaVersion: str
    characterId: str
    personality: dict[str, float]
    emotion: EmotionalVector
    internalThought: InternalThought
    behavior: BehaviorPlan
    speech: SpeechPlan
    memory: dict[str, Any]
    stateMachine: dict[str, Any]


POSITIVE = {"great", "good", "love", "happy", "proud", "excited", "nice", "wonderful", "thanks", "thank"}
CONCERN = {"sad", "worried", "anxious", "hurt", "alone", "stress", "stressed", "afraid", "tired", "hard"}
THINKING = {"maybe", "think", "plan", "step", "because", "consider", "reflect", "wonder"}


def clamp(value: Any, minimum: float = 0.0, maximum: float = 1.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = minimum
    return max(minimum, min(maximum, numeric))


def _character_id(character_name: str | None) -> str:
    text = (character_name or "").lower()
    if "vivi" in text or "rose" in text:
        return "rose"
    if "sakurada" in text or "robert" in text:
        return "robert"
    if "haru" in text:
        return "haru"
    return "yuna"


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z']+", text.lower()))


def _extract_topics(history: list[dict], message: str) -> dict[str, Any]:
    previous_words = set()
    for item in history[-12:]:
        previous_words.update(word for word in _words(str(item.get("content", ""))) if len(word) > 5)
    current_words = {word for word in _words(message) if len(word) > 5}
    repeated = sorted(current_words & previous_words)[:8]
    return {
        "recognizedTopics": repeated,
        "familiarity": clamp(len(repeated) / 4),
        "favoriteTopicSignal": clamp(len(repeated) / 3),
        "novelty": clamp(1 - len(repeated) / max(1, len(current_words) or 1)),
    }


def _safe_json_object(value: str) -> dict[str, Any]:
    text = (value or "").strip()
    if not text:
        return {}
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text)
    if fenced:
        text = fenced.group(1)
    elif not text.startswith("{"):
        match = re.search(r"\{[\s\S]*\}", text)
        text = match.group(0) if match else ""
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def companion_brain_system_prompt(character_id: str) -> str:
    personality = CHARACTER_PERSONALITIES.get(character_id, CHARACTER_PERSONALITIES["yuna"])
    return (
        "Return only JSON for an AI companion brain. Do not include markdown. "
        "Schema: {\"reply\":\"user-facing response\", \"brain\":{\"emotion\":{\"valence\":0..1,"
        "\"arousal\":0..1,\"dominance\":0..1,\"confidence\":0..1,\"curiosity\":0..1,"
        "\"engagement\":0..1,\"empathy\":0..1},\"attentionState\":\"listening|thinking|responding|"
        "curious|reflecting|excited|idle\",\"internalThought\":{\"thinkingDurationMs\":number,"
        "\"hesitationMs\":number,\"reflectionDepth\":0..1,\"responseConfidence\":0..1},"
        "\"behavior\":{\"eyeContact\":0..1,\"headTilt\":-1..1,\"gestureIntensity\":0..1,"
        "\"gestureTempo\":0..1},\"speech\":{\"speed\":0.75..1.25,\"pauseFrequency\":0..1,"
        "\"emphasis\":[\"short words or phrases\"],\"vocalEnergy\":0..1,\"emotionalIntensity\":0..1}}}. "
        f"Keep personality stable: {json.dumps(personality)}."
    )


def extract_reply_and_brain(raw_text: str) -> tuple[str, dict[str, Any]]:
    data = _safe_json_object(raw_text)
    if not data:
        return raw_text.strip(), {}
    reply = str(data.get("reply") or data.get("message") or "").strip()
    brain = data.get("brain") if isinstance(data.get("brain"), dict) else data
    return reply or raw_text.strip(), brain


def build_companion_brain(
    *,
    reply: str,
    raw_brain: dict[str, Any] | None,
    message: str,
    history: list[dict] | None,
    character_name: str | None,
) -> dict[str, Any]:
    character_id = _character_id(character_name)
    personality = CHARACTER_PERSONALITIES.get(character_id, CHARACTER_PERSONALITIES["yuna"])
    history = history or []
    memory = _extract_topics(history, message)
    message_words = _words(message)
    reply_words = _words(reply)
    raw_brain = raw_brain or {}
    raw_emotion = raw_brain.get("emotion") if isinstance(raw_brain.get("emotion"), dict) else {}
    positive = bool((message_words | reply_words) & POSITIVE)
    concerned = bool((message_words | reply_words) & CONCERN)
    thinking = bool((message_words | reply_words) & THINKING)
    question = "?" in message or "?" in reply

    valence = clamp(raw_emotion.get("valence", 0.72 if positive else 0.44 if concerned else 0.58))
    arousal = clamp(raw_emotion.get("arousal", 0.68 if positive or question else 0.36 if concerned else 0.44))
    curiosity = clamp(raw_emotion.get("curiosity", 0.76 if question or memory["novelty"] > 0.75 else personality["curiosity"]))
    confidence = clamp(raw_emotion.get("confidence", 0.54 if thinking or question else 0.76 + memory["familiarity"] * 0.12))
    empathy = clamp(raw_emotion.get("empathy", 0.88 if concerned else personality["warmth"]))
    engagement = clamp(raw_emotion.get("engagement", 0.78 + memory["familiarity"] * 0.16))
    dominance = clamp(raw_emotion.get("dominance", personality["assertiveness"]))
    emotion = EmotionalVector(valence, arousal, dominance, confidence, curiosity, engagement, empathy)

    attention = str(raw_brain.get("attentionState") or ("reflecting" if concerned else "curious" if question else "excited" if positive else "responding")).lower()
    if attention not in {"idle", "listening", "thinking", "responding", "curious", "reflecting", "excited"}:
        attention = "responding"

    raw_thought = raw_brain.get("internalThought") if isinstance(raw_brain.get("internalThought"), dict) else {}
    word_count = len(reply.split())
    thinking_ms = int(clamp(raw_thought.get("thinkingDurationMs", 420 + word_count * 18 + (260 if thinking or concerned else 0)), 180, 2200))
    hesitation_ms = int(clamp(raw_thought.get("hesitationMs", 120 if confidence < 0.58 else 40), 0, 700))
    thought = InternalThought(
        thinkingDurationMs=thinking_ms + random.randint(-80, 120),
        hesitationMs=hesitation_ms + random.randint(0, 80),
        reflectionDepth=clamp(raw_thought.get("reflectionDepth", 0.62 if concerned or thinking else 0.34)),
        responseConfidence=confidence,
        preSpeechBehavior="Reflecting" if concerned or thinking else "Thinking",
    )

    raw_behavior = raw_brain.get("behavior") if isinstance(raw_brain.get("behavior"), dict) else {}
    behavior = BehaviorPlan(
        state="Speaking",
        attentionState=attention,  # type: ignore[arg-type]
        eyeContact=clamp(raw_behavior.get("eyeContact", 0.62 + engagement * 0.25 - (0.08 if thinking else 0))),
        blinkRate=clamp(0.38 + arousal * 0.32 + (0.18 if concerned else 0)),
        headTilt=clamp(raw_behavior.get("headTilt", 0.22 if question else -0.08 if concerned else 0), -1, 1),
        gestureIntensity=clamp(raw_behavior.get("gestureIntensity", 0.18 + arousal * 0.44 + personality["energy"] * 0.16)),
        gestureTempo=clamp(raw_behavior.get("gestureTempo", 0.26 + arousal * 0.42)),
        reactionDelayMs=max(80, int(thought.thinkingDurationMs * 0.35 + thought.hesitationMs)),
        microUncertainty=clamp(1 - confidence),
        recognition=memory["familiarity"],
    )

    raw_speech = raw_brain.get("speech") if isinstance(raw_brain.get("speech"), dict) else {}
    emphasis = raw_speech.get("emphasis") if isinstance(raw_speech.get("emphasis"), list) else []
    emphasis = [str(item).strip()[:40] for item in emphasis if str(item).strip()][:4]
    speech = SpeechPlan(
        style="empathetic" if concerned else "curious" if question else "bright" if positive else "warm",
        speed=clamp(raw_speech.get("speed", 0.92 + personality["energy"] * 0.18 + arousal * 0.08), 0.76, 1.24),
        pauseFrequency=clamp(raw_speech.get("pauseFrequency", 0.22 + thought.reflectionDepth * 0.34)),
        pauseScale=clamp(0.78 + thought.reflectionDepth * 0.7, 0.65, 1.5),
        emphasis=emphasis,
        vocalEnergy=clamp(raw_speech.get("vocalEnergy", 0.26 + arousal * 0.54 + personality["enthusiasm"] * 0.14)),
        emotionalIntensity=clamp(raw_speech.get("emotionalIntensity", 0.28 + abs(valence - 0.5) + arousal * 0.26)),
        confidence=confidence,
    )
    speech.markupText = build_speech_markup(reply, speech)

    return asdict(
        CompanionBrainOutput(
            schemaVersion="companion-brain.v1",
            characterId=character_id,
            personality=personality,
            emotion=emotion,
            internalThought=thought,
            behavior=behavior,
            speech=speech,
            memory=memory,
            stateMachine={
                "current": "Speaking",
                "previous": "Thinking",
                "next": "Listening",
                "transitions": ["Idle->Listening", "Listening->Thinking", "Thinking->Speaking", "Speaking->Listening", "Speaking->Reacting", "Reacting->Reflecting"],
            },
        )
    )


def build_speech_markup(reply: str, speech: SpeechPlan) -> str:
    text = " ".join(reply.split())
    for phrase in speech.emphasis:
        if phrase and phrase.lower() in text.lower():
            text = re.sub(re.escape(phrase), f"<emphasis>{phrase}</emphasis>", text, count=1, flags=re.IGNORECASE)
    pause_ms = int(180 * speech.pauseScale)
    text = re.sub(r"([.!?])\s+", f"\\1 <pause ms=\"{pause_ms}\" /> ", text)
    if speech.confidence < 0.55:
        text = f"<reflection /> {text}"
    return text.strip()
