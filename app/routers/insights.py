from __future__ import annotations

from collections import Counter, defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, Query

from app.companion import analyze_emotion, dashboard_from_messages
from app.database import conversations_collection, memories_collection, utc_now
from app.security import get_current_user


router = APIRouter(prefix="/api/insights", tags=["insights"])

MOOD_TERMS = {
    "positive": {"good", "great", "happy", "excited", "proud", "hopeful", "better", "love", "grateful"},
    "calm": {"calm", "peaceful", "relaxed", "steady", "quiet", "rest"},
    "anxious": {"anxious", "worried", "stress", "stressed", "panic", "afraid", "overwhelmed"},
    "low": {"sad", "down", "lonely", "tired", "depressed", "hurt", "lost"},
    "reflective": {"think", "reflect", "realize", "wonder", "learn", "meaning"},
}


def _classify(text: str) -> tuple[str, float]:
    analysis = analyze_emotion(text)
    primary = analysis["primary"]
    # Keep the original UI's six reflection buckets stable while the stored
    # analysis retains the more expressive companion emotion vocabulary.
    mapped = {
        "happy": "positive", "excited": "positive", "hopeful": "positive", "motivated": "positive",
        "nervous": "anxious", "angry": "anxious", "frustrated": "anxious", "embarrassed": "anxious",
        "sad": "low", "lonely": "low", "calm": "calm", "curious": "reflective", "confused": "reflective",
    }.get(primary, "neutral")
    if analysis["signals"] or "?" in text:
        tone = {"positive": 0.8, "calm": 0.7, "reflective": 0.6, "anxious": 0.3, "low": 0.2}[mapped]
        return mapped, tone
    words = set(text.lower().replace(".", " ").replace(",", " ").split())
    scores = {mood: len(words & terms) for mood, terms in MOOD_TERMS.items()}
    mood, score = max(scores.items(), key=lambda item: item[1])
    if score == 0:
        return "neutral", 0.55
    tone = {"positive": 0.8, "calm": 0.7, "reflective": 0.6, "anxious": 0.3, "low": 0.2}[mood]
    return mood, tone


@router.get("")
def get_insights(
    days: int = Query(default=30, ge=7, le=365),
    current_user: dict = Depends(get_current_user),
) -> dict:
    today = utc_now().date()
    start = today - timedelta(days=days - 1)
    daily: dict[str, dict] = {str(start + timedelta(days=index)): {"messages": 0, "toneTotal": 0.0, "toneCount": 0} for index in range(days)}
    moods: Counter[str] = Counter()
    all_messages: list[dict] = []
    weekday_tones: defaultdict[int, list[float]] = defaultdict(list)
    visual_expressions: Counter[str] = Counter()
    visual_engagement: Counter[str] = Counter()
    latest_visual: dict | None = None

    for conversation in conversations_collection().find({"user_id": current_user["_id"]}, {"messages": 1}):
        for message in conversation.get("messages", []):
            if message.get("role") != "user" or not message.get("timestamp"):
                continue
            all_messages.append(message)
            timestamp = message["timestamp"]
            if timestamp.date() < start:
                continue
            day = str(timestamp.date())
            if day not in daily:
                continue
            analysis = message.get("analysis") or analyze_emotion(str(message.get("content", "")))
            mood, tone = _classify(str(message.get("content", "")))
            daily[day]["messages"] += 1
            daily[day]["toneTotal"] += tone
            daily[day]["toneCount"] += 1
            moods[mood] += 1
            weekday_tones[timestamp.weekday()].append(tone)
            vision = message.get("vision")
            if isinstance(vision, dict):
                visual_expressions[str(vision.get("expression", "unclear"))] += 1
                visual_engagement[str(vision.get("engagement", "uncertain"))] += 1
                if latest_visual is None or timestamp > latest_visual["timestamp"]:
                    latest_visual = {"timestamp": timestamp, **vision}

    timeline = [
        {"date": date, "messages": values["messages"], "tone": round(values["toneTotal"] / values["toneCount"] * 100) if values["toneCount"] else None}
        for date, values in daily.items()
    ]
    weekly = [
        {"day": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index], "tone": round(sum(weekday_tones[index]) / len(weekday_tones[index]) * 100) if weekday_tones[index] else None}
        for index in range(7)
    ]
    memory_count = memories_collection().count_documents({"user_id": current_user["_id"]})
    dashboard = dashboard_from_messages(all_messages, memory_count)
    return {
        "days": days,
        "timeline": timeline,
        "moods": dict(moods),
        "weekly": weekly,
        "activeDays": sum(1 for item in timeline if item["messages"]),
        "messageCount": sum(item["messages"] for item in timeline),
        "dashboard": dashboard,
        "camera": {
            "checkInCount": sum(visual_expressions.values()),
            "expressions": dict(visual_expressions),
            "engagement": dict(visual_engagement),
            "latest": {key: value for key, value in (latest_visual or {}).items() if key != "timestamp"},
        },
        "notice": "Insights are lightweight estimates from words and optional camera check-ins you choose to share; they are not a diagnosis.",
    }
