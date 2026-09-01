from __future__ import annotations

from datetime import timedelta
from typing import Any

from pymongo import ReturnDocument

from app.companion import build_memory_context, extract_memory_candidates
from app.database import memories_collection, utc_now


def retrieve_memories(user_id, message: str, limit: int = 8) -> list[dict[str, Any]]:
    """Retrieve a small relevant set. Expired reminders are never returned."""
    now = utc_now()
    documents = list(
        memories_collection().find(
            {"user_id": user_id, "$or": [{"expires_at": {"$exists": False}}, {"expires_at": None}, {"expires_at": {"$gte": now}}]},
            {"user_id": 0},
        ).sort([("importance", -1), ("updated_at", -1)]).limit(80)
    )
    relevant = build_memory_context(documents, message, limit=limit)
    if relevant:
        memories_collection().update_many(
            {
                "user_id": user_id,
                "$or": [{"category": item.get("category"), "key": item.get("key")} for item in relevant],
            },
            {"$set": {"last_used_at": now}, "$inc": {"use_count": 1}},
        )
    return relevant


def save_memory_candidates(user_id, text: str, source_message_id: str | None = None) -> list[dict[str, Any]]:
    """Upsert only explicit facts found by the deterministic extractor."""
    now = utc_now()
    saved: list[dict[str, Any]] = []
    for candidate in extract_memory_candidates(text):
        identity = {"user_id": user_id, "category": candidate["category"], "key": candidate["key"]}
        existing = memories_collection().find_one(identity)
        if (
            existing
            and candidate["category"] in {"identity", "life", "relationship"}
            and str(existing.get("value", "")).strip().casefold() != str(candidate["value"]).strip().casefold()
        ):
            memories_collection().update_one(
                {"_id": existing["_id"], "user_id": user_id},
                {"$set": {"pending_conflict": {"value": candidate["value"], "source_message_id": source_message_id, "detected_at": now}}},
            )
            continue
        document = {
            "category": candidate["category"],
            "key": candidate["key"],
            "value": candidate["value"],
            "importance": candidate["importance"],
            "updated_at": now,
            "source_message_id": source_message_id,
        }
        if candidate["temporary"]:
            document["expires_at"] = now + timedelta(days=28)
        result = memories_collection().find_one_and_update(
            identity,
            {"$set": document, "$setOnInsert": {"user_id": user_id, "created_at": now}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if result:
            saved.append(result)
    return saved
