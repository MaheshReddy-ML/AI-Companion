from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import PyMongoError

from app.avatar_catalog import resolve_avatar_payload
from app.access import access_profile
from app.config import settings


_client: MongoClient | None = None
_database: Database | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """Return a UTC-aware datetime, including PyMongo's naive UTC values."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return as_utc(value).isoformat().replace("+00:00", "Z")


def get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(
            settings.mongo_uri,
            serverSelectionTimeoutMS=settings.mongo_server_selection_timeout_ms,
        )
    return _client


def get_database() -> Database:
    global _database
    if _database is None:
        client = get_client()
        try:
            _database = client.get_default_database()
        except Exception:
            _database = client[settings.mongo_database]

        if _database is None:
            _database = client[settings.mongo_database]
    return _database


def users_collection() -> Collection:
    return get_database()["users"]


def conversations_collection() -> Collection:
    return get_database()["conversations"]


def posts_collection() -> Collection:
    return get_database()["posts"]


def attachments_collection() -> Collection:
    return get_database()["attachments"]


def memories_collection() -> Collection:
    return get_database()["memories"]


def feature_collection(name: str) -> Collection:
    return get_database()[name]


def check_database_connection() -> dict[str, Any]:
    try:
        get_client().admin.command("ping")
    except PyMongoError as exc:
        return {
            "ok": False,
            "database": settings.mongo_database,
            "error": str(exc),
        }

    return {
        "ok": True,
        "database": settings.mongo_database,
    }


def ensure_indexes() -> None:
    try:
        users_collection().create_index([("email", ASCENDING)], unique=True)
        users_collection().create_index([("anonymous_id", ASCENDING)], unique=True, sparse=True)
        users_collection().create_index([("token_version", ASCENDING)])
        conversations_collection().create_index([("user_id", ASCENDING), ("updated_at", DESCENDING)])
        conversations_collection().create_index([("user_id", ASCENDING), ("title", ASCENDING)])
        posts_collection().create_index([("created_at", DESCENDING)])
        posts_collection().create_index([("anonymous_id", ASCENDING), ("created_at", DESCENDING)])
        posts_collection().create_index([("moderation_status", ASCENDING), ("created_at", DESCENDING)])
        attachments_collection().create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
        attachments_collection().create_index([("conversation_id", ASCENDING)])
        memories_collection().create_index([("user_id", ASCENDING), ("updated_at", DESCENDING)])
        memories_collection().create_index([("user_id", ASCENDING), ("category", ASCENDING), ("key", ASCENDING)], unique=True)
        memories_collection().create_index([("expires_at", ASCENDING)], sparse=True)
        get_database()["quests"].create_index([("user_id", ASCENDING), ("date", DESCENDING)])
        get_database()["play_events"].create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
        focus_rooms = get_database()["focus_rooms"]
        focus_rooms.create_index([("code", ASCENDING)], unique=True)
        existing_ends_index = focus_rooms.index_information().get("ends_at_1", {})
        if existing_ends_index.get("expireAfterSeconds") is not None:
            focus_rooms.drop_index("ends_at_1")
        focus_rooms.create_index([("ends_at", ASCENDING)], name="focus_rooms_ends_at")
        focus_rooms.create_index([("delete_at", ASCENDING)], name="focus_rooms_delete_at", expireAfterSeconds=0)
        focus_rooms.create_index([("members", ASCENDING), ("last_activity_at", DESCENDING)])
        focus_presence = get_database()["focus_room_presence"]
        focus_presence.create_index(
            [("room_id", ASCENDING), ("user_id", ASCENDING), ("connection_id", ASCENDING)],
            unique=True,
        )
        focus_presence.create_index([("room_id", ASCENDING), ("last_seen_at", DESCENDING)])
        focus_presence.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
        get_database()["user_spaces"].create_index([("user_id", ASCENDING)], unique=True)
        get_database()["journal_entries"].create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
        get_database()["goals"].create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
        get_database()["daily_check_ins"].create_index([("user_id", ASCENDING), ("date", DESCENDING)], unique=True)
        get_database()["user_preferences"].create_index([("user_id", ASCENDING)], unique=True)
        get_database()["billing_requests"].create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
        get_database()["billing_requests"].create_index([("status", ASCENDING), ("created_at", DESCENDING)])
    except PyMongoError as exc:
        raise RuntimeError(
            f"MongoDB is not reachable at {settings.mongo_uri}. "
            "Start MongoDB or update MONGO_URI in the project .env file."
        ) from exc


def parse_object_id(value: str) -> ObjectId | None:
    if not ObjectId.is_valid(value):
        return None
    return ObjectId(value)


def serialize_user(document: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "_id": str(document["_id"]),
        "name": document.get("name", ""),
        "email": document.get("email", ""),
        "authProvider": document.get("auth_provider", "local"),
        "createdAt": to_iso(document.get("created_at")),
    }
    payload.update(resolve_avatar_payload(document))
    payload["access"] = access_profile(document)
    return payload


def serialize_message(document: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "id": document.get("id"),
        "role": document.get("role", "user"),
        "content": document.get("content", ""),
        "attachmentName": document.get("attachment_name"),
        "attachmentId": str(document["attachment_id"]) if document.get("attachment_id") else None,
        "timestamp": to_iso(document.get("timestamp")),
    }
    if document.get("brain"):
        payload["brain"] = document.get("brain")
    if document.get("analysis"):
        payload["analysis"] = document.get("analysis")
    if document.get("behavior_report"):
        payload["behaviorReport"] = document.get("behavior_report")
    if document.get("vision"):
        payload["vision"] = document.get("vision")
    if document.get("web_search"):
        payload["webSearch"] = document.get("web_search")
    return payload


def serialize_conversation(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "title": document.get("title", "New conversation"),
        "pinned": bool(document.get("pinned", False)),
        "characterId": document.get("character_id"),
        "characterName": document.get("character_name"),
        "personaPrompt": document.get("persona_prompt"),
        "companionMode": document.get("companion_mode", "listen"),
        "messages": [serialize_message(message) for message in document.get("messages", [])],
        "createdAt": to_iso(document.get("created_at")),
        "updatedAt": to_iso(document.get("updated_at")),
    }


def serialize_post(document: dict[str, Any], *, current_anonymous_id: str | None = None) -> dict[str, Any]:
    return {
        "_id": str(document["_id"]),
        "content": document.get("content", ""),
        "created_at": to_iso(document.get("created_at")),
        "updated_at": to_iso(document.get("updated_at")),
        "likes": int(document.get("likes", 0)),
        "liked_by_current_user": bool(current_anonymous_id and current_anonymous_id in document.get("liked_by", [])),
        "moderation_status": document.get("moderation_status") or "visible",
        "owned_by_current_user": bool(current_anonymous_id and document.get("anonymous_id") == current_anonymous_id),
    }
