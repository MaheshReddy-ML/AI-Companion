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
}


def get_user_preferences(user_id) -> dict[str, bool]:
    document = feature_collection("user_preferences").find_one({"user_id": user_id}) or {}
    return {key: bool(document.get(key, default)) for key, default in PREFERENCE_DEFAULTS.items()}


def update_user_preferences(user_id, changes: dict[str, bool]) -> dict[str, bool]:
    unknown = set(changes) - set(PREFERENCE_DEFAULTS)
    if unknown:
        raise ValueError(f"Unknown preference: {sorted(unknown)[0]}")
    if changes:
        feature_collection("user_preferences").update_one(
            {"user_id": user_id},
            {"$set": {**changes, "updated_at": utc_now()}, "$setOnInsert": {"user_id": user_id}},
            upsert=True,
        )
    return get_user_preferences(user_id)
