from __future__ import annotations

from datetime import timedelta

from app.database import feature_collection, to_iso, utc_now


NOTIFICATION_RETENTION_DAYS = 90


def create_notification(
    user_id,
    *,
    category: str,
    title: str,
    message: str,
    action_path: str | None = None,
    action_label: str | None = None,
    dedupe_key: str | None = None,
    importance: str = "normal",
    celebration: bool = False,
) -> dict:
    now = utc_now()
    document = {
        "user_id": user_id,
        "category": category[:40],
        "title": title.strip()[:120],
        "message": message.strip()[:500],
        "action_path": action_path if action_path and action_path.startswith("/") and not action_path.startswith("//") else None,
        "action_label": action_label.strip()[:40] if action_label else None,
        "importance": importance if importance in {"normal", "high"} else "normal",
        "celebration": bool(celebration),
        "read_at": None,
        "created_at": now,
        "delete_at": now + timedelta(days=NOTIFICATION_RETENTION_DAYS),
    }
    collection = feature_collection("notifications")
    if dedupe_key:
        document["dedupe_key"] = dedupe_key[:160]
        collection.update_one(
            {"user_id": user_id, "dedupe_key": document["dedupe_key"]},
            {"$setOnInsert": document},
            upsert=True,
        )
        return collection.find_one({"user_id": user_id, "dedupe_key": document["dedupe_key"]})
    inserted = collection.insert_one(document)
    document["_id"] = inserted.inserted_id
    return document


def serialize_notification(item: dict) -> dict:
    return {
        "id": str(item["_id"]),
        "category": item.get("category", "update"),
        "title": item.get("title", "Emora update"),
        "message": item.get("message", ""),
        "actionPath": item.get("action_path"),
        "actionLabel": item.get("action_label") or "Open",
        "importance": item.get("importance", "normal"),
        "celebration": bool(item.get("celebration", False)),
        "reaction": item.get("reaction"),
        "snoozedUntil": to_iso(item.get("snoozed_until")),
        "read": item.get("read_at") is not None,
        "readAt": to_iso(item.get("read_at")),
        "createdAt": to_iso(item.get("created_at")),
    }
