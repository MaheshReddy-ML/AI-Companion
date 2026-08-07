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
    return build_memory_context(documents, message, limit=limit)


def save_memory_candidates(user_id, text: str, source_message_id: str | None = None) -> list[dict[str, Any]]:
    """Upsert only explicit facts found by the deterministic extractor."""
    now = utc_now()
    saved: list[dict[str, Any]] = []
    for candidate in extract_memory_candidates(text):
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
            {"user_id": user_id, "category": candidate["category"], "key": candidate["key"]},
            {"$set": document, "$setOnInsert": {"user_id": user_id, "created_at": now}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if result:
            saved.append(result)
    return saved
