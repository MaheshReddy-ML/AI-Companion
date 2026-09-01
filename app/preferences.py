from __future__ import annotations

from app.database import feature_collection, utc_now


PREFERENCE_DEFAULTS = {
    "emotionalMemory": True,
    "visualInput": False,
    "connectionReminders": True,
    "weeklyReflection": True,
    "streakReminders": True,
    "quietHours": False,
    "dataMinimisation": True,
    # Pro users may explicitly allow goals and their latest check-in to inform
    # a reply. It is off by default because this is sensitive context.
    "adaptiveContext": False,
    "responseStyle": "balanced",
    "humor": "gentle",
    "energy": "calm",
    "depth": "moderate",
    "textSize": "system",
    "motion": "system",
    "contrast": "system",
    "calmEffects": False,
    # Product events are disabled until the user explicitly opts in. Event
    # payloads use a small allowlist and never include conversation content.
    "productAnalytics": False,
    # Optional state cues. Off by default; all information remains visible and
    # audible cues are short, nonverbal, and never used for emotional nudging.
    "sensoryFeedback": False,
}


def get_user_preferences(user_id) -> dict[str, object]:
    document = feature_collection("user_preferences").find_one({"user_id": user_id}) or {}
    return {
        key: bool(document.get(key, default)) if isinstance(default, bool) else str(document.get(key, default))
        for key, default in PREFERENCE_DEFAULTS.items()
    }


def get_preference_version(user_id) -> int:
    document = feature_collection("user_preferences").find_one({"user_id": user_id}) or {}
    return int(document.get("version", 1))


def update_user_preferences(user_id, changes: dict[str, object], *, expected_version: int | None = None) -> dict[str, object]:
    unknown = set(changes) - set(PREFERENCE_DEFAULTS)
    if unknown:
        raise ValueError(f"Unknown preference: {sorted(unknown)[0]}")
    if changes:
        collection = feature_collection("user_preferences")
        existing = collection.find_one({"user_id": user_id})
        query: dict = {"user_id": user_id}
        if expected_version is not None:
            query["$or"] = [{"version": expected_version}, {"version": {"$exists": False}}] if expected_version == 1 else [{"version": expected_version}]
        result = collection.update_one(
            query,
            {"$set": {**changes, "updated_at": utc_now()}, "$setOnInsert": {"user_id": user_id, "version": 0}, "$inc": {"version": 1}},
            upsert=existing is None,
        )
        if expected_version is not None and not result.matched_count and not result.upserted_id:
            raise RuntimeError("preferences_conflict")
    return get_user_preferences(user_id)
