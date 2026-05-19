from __future__ import annotations

from uuid import UUID, uuid4

from pymongo import DESCENDING, ReturnDocument

from app.database import parse_object_id, posts_collection, serialize_post, users_collection, utc_now
from app.models.schemas import PostCreateRequest


def is_valid_anonymous_id(value: str | None) -> bool:
    try:
        UUID(str(value))
        return True
    except (TypeError, ValueError):
        return False


def get_or_create_anonymous_id_for_user(user: dict) -> str:
    existing = user.get("anonymous_id")
    if is_valid_anonymous_id(existing):
        return str(existing)

    anonymous_id = str(uuid4())
    users_collection().update_one(
        {"_id": user["_id"]},
        {"$set": {"anonymous_id": anonymous_id, "updated_at": utc_now()}},
    )
    user["anonymous_id"] = anonymous_id
    return anonymous_id


def build_post_document(payload: PostCreateRequest, anonymous_id: str) -> dict:
    return {
        "content": payload.content,
        "anonymous_id": anonymous_id,
        "created_at": utc_now(),
        "likes": 0,
    }


def create_post(payload: PostCreateRequest, user: dict) -> dict:
    document = build_post_document(payload, get_or_create_anonymous_id_for_user(user))
    inserted = posts_collection().insert_one(document)
    document["_id"] = inserted.inserted_id
    return serialize_post(document)


def list_posts() -> list[dict]:
    cursor = posts_collection().find().sort("created_at", DESCENDING)
    return [serialize_post(document) for document in cursor]


def like_post(post_id: str) -> dict:
    object_id = parse_object_id(post_id)
    if object_id is None:
        raise ValueError("Invalid post id.")

    updated_post = posts_collection().find_one_and_update(
        {"_id": object_id},
        {"$inc": {"likes": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if updated_post is None:
        raise LookupError("Post not found.")

    return serialize_post(updated_post)
