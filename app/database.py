from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import PyMongoError

from app.avatar_catalog import resolve_avatar_payload
from app.config import settings


_client: MongoClient | None = None
_database: Database | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


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


def ensure_indexes() -> None:
    try:
        users_collection().create_index([("email", ASCENDING)], unique=True)
        users_collection().create_index([("anonymous_id", ASCENDING)], unique=True, sparse=True)
        conversations_collection().create_index([("user_id", ASCENDING), ("updated_at", DESCENDING)])
        posts_collection().create_index([("created_at", DESCENDING)])
        posts_collection().create_index([("anonymous_id", ASCENDING), ("created_at", DESCENDING)])
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
    }
    payload.update(resolve_avatar_payload(document))
    return payload


def serialize_message(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": document.get("id"),
        "role": document.get("role", "user"),
        "content": document.get("content", ""),
        "attachmentName": document.get("attachment_name"),
        "timestamp": to_iso(document.get("timestamp")),
    }


def serialize_conversation(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "title": document.get("title", "New conversation"),
        "pinned": bool(document.get("pinned", False)),
        "characterId": document.get("character_id"),
        "characterName": document.get("character_name"),
        "personaPrompt": document.get("persona_prompt"),
        "messages": [serialize_message(message) for message in document.get("messages", [])],
        "createdAt": to_iso(document.get("created_at")),
        "updatedAt": to_iso(document.get("updated_at")),
    }


def serialize_post(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "_id": str(document["_id"]),
        "content": document.get("content", ""),
        "created_at": to_iso(document.get("created_at")),
        "likes": int(document.get("likes", 0)),
    }
