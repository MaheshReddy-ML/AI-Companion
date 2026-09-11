from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.companion import analyze_emotion, dashboard_from_messages
from app.access import has_entitlement
from app.database import conversations_collection, feature_collection, memories_collection, utc_now
from app.security import get_current_user
from app.rate_limit import rate_limit


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


def _build_premium_brief(timeline: list[dict], moods: Counter[str], dashboard: dict) -> dict:
    active_items = [item for item in timeline if item.get("messages") or item.get("checkIns")]
    tone_items = [item for item in timeline if item.get("tone") is not None]
    dominant_mood, dominant_count = moods.most_common(1)[0] if moods else ("not enough data", 0)
    midpoint = max(1, len(tone_items) // 2)
    earlier = tone_items[:midpoint]
    recent = tone_items[midpoint:]
    tone_shift = None
    tone_direction = "Not enough tone data yet"
    if earlier and recent:
        earlier_average = sum(item["tone"] for item in earlier) / len(earlier)
        recent_average = sum(item["tone"] for item in recent) / len(recent)
        tone_shift = round(recent_average - earlier_average)
        if tone_shift >= 4:
            tone_direction = "Tone moved upward"
        elif tone_shift <= -4:
            tone_direction = "Tone moved downward"
        else:
            tone_direction = "Tone stayed relatively steady"

    weekday_activity: Counter[str] = Counter()
    for item in active_items:
        weekday = date.fromisoformat(item["date"]).strftime("%A")
        weekday_activity[weekday] += int(item.get("messages", 0)) + int(item.get("checkIns", 0))

    strongest_day = weekday_activity.most_common(1)[0][0] if weekday_activity else "Still emerging"
    consistency = round(len(active_items) / max(1, len(timeline)) * 100)
    topics = list(dashboard.get("mostDiscussedTopics") or [])[:3]
    return {
        "dominantMood": dominant_mood,
        "dominantMoodCount": dominant_count,
        "activeDays": len(active_items),
        "consistencyPercent": consistency,
        "toneShift": tone_shift,
        "toneDirection": tone_direction,
        "strongestDay": strongest_day,
        "topTopics": topics,
    }


def _build_period_reflection(
    *,
    days: int,
    messages: list[dict],
    moods: Counter[str],
    goals: list[dict],
    journals: list[dict],
    memory_count: int,
) -> dict:
    period_dashboard = dashboard_from_messages(messages, memory_count)
    topics = list(period_dashboard.get("mostDiscussedTopics") or [])[:4]
    dominant_mood = moods.most_common(1)[0][0] if moods else None
    return {
        "title": f"Your last {days} days with Emora",
        "explored": topics,
        "returnedTo": dominant_mood,
        "progress": [str(item.get("title", "")).strip() for item in goals[:4] if str(item.get("title", "")).strip()],
        "journalCount": len(journals),
        "memoryCount": memory_count,
        "savedMoments": len(messages),
        "revisit": next((str(item.get("content", "")).strip()[:180] for item in messages if str(item.get("content", "")).strip()), None),
    }


@router.get("", dependencies=[Depends(rate_limit(60, 300, "insights-read"))])
def get_insights(
    days: int = Query(default=30, ge=7, le=365),
    current_user: dict = Depends(get_current_user),
) -> dict:
    if days > 90 and not has_entitlement(current_user, "advanced_insights"):
        raise HTTPException(status_code=403, detail="All-time reflection is included with Pro.")
    if days > 30 and not has_entitlement(current_user, "look_back"):
        raise HTTPException(status_code=403, detail="Longer reflection ranges are included with Plus.")
    today = utc_now().date()
    start = today - timedelta(days=days - 1)
    range_start_at = utc_now() - timedelta(days=days)
    daily: dict[str, dict] = {str(start + timedelta(days=index)): {"messages": 0, "toneTotal": 0.0, "toneCount": 0} for index in range(days)}
    moods: Counter[str] = Counter()
    all_messages: list[dict] = []
    selected_messages: list[dict] = []
    weekday_tones: defaultdict[int, list[float]] = defaultdict(list)
    visual_expressions: Counter[str] = Counter()
    visual_engagement: Counter[str] = Counter()
    latest_visual: dict | None = None
    arrivals: list[dict] = []
    completed_goals = list(feature_collection("goals").find({"user_id": current_user["_id"], "completed": True, "completed_at": {"$gte": range_start_at}}).sort("completed_at", -1).limit(20))
    journal_entries = list(feature_collection("journal_entries").find({"user_id": current_user["_id"], "created_at": {"$gte": range_start_at}}, {"title": 1, "mood": 1, "created_at": 1}).sort("created_at", -1).limit(20))
    goals_completed = len(completed_goals)

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
            selected_messages.append(message)
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

    for item in feature_collection("daily_check_ins").find({"user_id": current_user["_id"], "date": {"$gte": str(start)}}).sort("date", -1):
        arrivals.append(item)
        mood = str(item.get("mood", "unsure"))
        mapped_mood = {"hopeful": "positive", "tired": "low", "unsure": "neutral"}.get(mood, mood)
        moods[mapped_mood] += 1
        if item.get("date") in daily:
            daily[item["date"]]["checkIns"] = daily[item["date"]].get("checkIns", 0) + 1

    timeline = [
        {"date": date, "messages": values["messages"], "checkIns": values.get("checkIns", 0), "tone": round(values["toneTotal"] / values["toneCount"] * 100) if values["toneCount"] else None}
        for date, values in daily.items()
    ]
    weekly = [
        {"day": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index], "tone": round(sum(weekday_tones[index]) / len(weekday_tones[index]) * 100) if weekday_tones[index] else None}
        for index in range(7)
    ]
    memory_count = memories_collection().count_documents({"user_id": current_user["_id"]})
    dashboard = dashboard_from_messages(all_messages, memory_count)
    look_back_enabled = has_entitlement(current_user, "look_back")
    advanced_enabled = has_entitlement(current_user, "advanced_insights")
    premium_brief = _build_premium_brief(timeline, moods, dashboard) if advanced_enabled else None
    selected_messages = sorted(selected_messages, key=lambda item: item.get("timestamp"), reverse=True)
    period_reflection = _build_period_reflection(days=days, messages=selected_messages, moods=moods, goals=completed_goals, journals=journal_entries, memory_count=memory_count) if advanced_enabled else None
    reflection_timeline: list[dict] = []
    if advanced_enabled:
        reflection_timeline.extend({"date": item.get("date"), "type": "arrival", "title": f"Arrived feeling {item.get('mood', 'unsure')}", "detail": item.get("note") or item.get("tiny_thing") or "A private check-in"} for item in arrivals[:6])
        reflection_timeline.extend({"date": item.get("created_at").date().isoformat(), "type": "journal", "title": item.get("title", "Private reflection"), "detail": f"Journal mood: {item.get('mood', 'reflective')}"} for item in journal_entries if item.get("created_at"))
        reflection_timeline.extend({"date": item.get("completed_at").date().isoformat(), "type": "goal", "title": item.get("title", "Goal completed"), "detail": "A goal moved forward"} for item in completed_goals if item.get("completed_at"))
        reflection_timeline.extend({"date": item.get("timestamp").date().isoformat(), "type": "conversation", "title": "A conversation moment", "detail": str(item.get("content", "")).strip()[:140]} for item in sorted(selected_messages, key=lambda value: value.get("timestamp"), reverse=True)[:5] if item.get("timestamp"))
        reflection_timeline = sorted(reflection_timeline, key=lambda item: item.get("date") or "", reverse=True)[:16]
    observations: list[str] = []
    if advanced_enabled:
        if dashboard.get("mostDiscussedTopics"):
            observations.append(f"You have returned most often to {', '.join(dashboard['mostDiscussedTopics'][:3])}.")
        if sum(1 for item in timeline if item["messages"] or item["checkIns"]):
            observations.append(f"You made space to reflect on {sum(1 for item in timeline if item['messages'] or item['checkIns'])} days in this period.")
        if arrivals:
            common_arrival = Counter(str(item.get("mood", "unsure")) for item in arrivals).most_common(1)[0][0]
            observations.append(f"Your most common arrival word was {common_arrival}.")
    return {
        "days": days,
        "timeline": timeline,
        "moods": dict(moods),
        "weekly": weekly,
        "activeDays": sum(1 for item in timeline if item["messages"] or item["checkIns"]),
        "messageCount": sum(item["messages"] for item in timeline),
        "arrivalCount": len(arrivals),
        "goalsCompleted": goals_completed,
        "lookBack": [
            {
                "date": item["date"],
                "mood": item.get("mood", "unsure"),
                "note": item.get("note", ""),
                "tinyThing": item.get("tiny_thing", ""),
            }
            for item in arrivals[:6]
        ] if look_back_enabled else [],
        "historicalObservations": observations,
        "premiumBrief": premium_brief,
        "periodReflection": period_reflection,
        "reflectionTimeline": reflection_timeline,
        "access": {"lookBack": look_back_enabled, "advancedInsights": advanced_enabled},
        "dashboard": dashboard,
        "camera": {
            "checkInCount": sum(visual_expressions.values()),
            "expressions": dict(visual_expressions),
            "engagement": dict(visual_engagement),
            "latest": {key: value for key, value in (latest_visual or {}).items() if key != "timestamp"},
        },
        "notice": "Insights are lightweight estimates from words and optional camera check-ins you choose to share; they are not a diagnosis.",
    }
