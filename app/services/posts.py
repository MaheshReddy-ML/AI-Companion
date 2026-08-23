from __future__ import annotations

from uuid import UUID, uuid4

from pymongo import DESCENDING, ReturnDocument

from app.database import parse_object_id, posts_collection, serialize_post, users_collection, utc_now
from app.models.schemas import PostCreateRequest, PostUpdateRequest


BLOCKED_TERMS = {
    "kill yourself",
    "self harm instructions",
    "doxx",
    "hate speech",
}


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


def moderate_content(content: str) -> tuple[str, list[str]]:
    lowered = content.lower()
    matches = sorted(term for term in BLOCKED_TERMS if term in lowered)
    if matches:
        return "needs_review", matches
    return "visible", []


def build_post_document(payload: PostCreateRequest, anonymous_id: str) -> dict:
    moderation_status, moderation_reasons = moderate_content(payload.content)
    return {
        "content": payload.content,
        "anonymous_id": anonymous_id,
        "created_at": utc_now(),
        "updated_at": None,
        "likes": 0,
        "liked_by": [],
        "moderation_status": moderation_status,
        "moderation_reasons": moderation_reasons,
    }


def create_post(payload: PostCreateRequest, user: dict) -> dict:
    anonymous_id = get_or_create_anonymous_id_for_user(user)
    document = build_post_document(payload, anonymous_id)
    inserted = posts_collection().insert_one(document)
    document["_id"] = inserted.inserted_id
    return serialize_post(document, current_anonymous_id=anonymous_id)


def list_posts(user: dict, page: int = 1, limit: int = 20) -> dict:
    anonymous_id = get_or_create_anonymous_id_for_user(user)
    safe_page = max(1, page)
    safe_limit = min(50, max(1, limit))
    query = {
        "$or": [
            {"moderation_status": "visible"},
            # Posts created before moderation metadata was introduced were
            # already treated as visible by serialize_post. Include those
            # legacy documents in the database query as well.
            {"moderation_status": None},
            {"anonymous_id": anonymous_id},
        ]
    }
    total = posts_collection().count_documents(query)
    cursor = (
        posts_collection()
        .find(query)
        .sort("created_at", DESCENDING)
        .skip((safe_page - 1) * safe_limit)
        .limit(safe_limit)
    )
    posts = [serialize_post(document, current_anonymous_id=anonymous_id) for document in cursor]
    return {
        "posts": posts,
        "page": safe_page,
        "limit": safe_limit,
        "total": total,
        "has_more": safe_page * safe_limit < total,
    }


def like_post(post_id: str, user: dict) -> dict:
    object_id = parse_object_id(post_id)
    if object_id is None:
        raise ValueError("Invalid post id.")

    anonymous_id = get_or_create_anonymous_id_for_user(user)
    query = {
        "_id": object_id,
        "liked_by": {"$ne": anonymous_id},
        "$or": [
            {"moderation_status": "visible"},
            {"moderation_status": None},
        ],
    }
    updated_post = posts_collection().find_one_and_update(
        query,
        {"$inc": {"likes": 1}, "$addToSet": {"liked_by": anonymous_id}},
        return_document=ReturnDocument.AFTER,
    )
    if updated_post is None:
        raise LookupError("Post not found or already related to.")

    return serialize_post(updated_post, current_anonymous_id=anonymous_id)


def update_post(post_id: str, payload: PostUpdateRequest, user: dict) -> dict:
    object_id = parse_object_id(post_id)
    if object_id is None:
        raise ValueError("Invalid post id.")

    anonymous_id = get_or_create_anonymous_id_for_user(user)
    moderation_status, moderation_reasons = moderate_content(payload.content)
    updated_post = posts_collection().find_one_and_update(
        {"_id": object_id, "anonymous_id": anonymous_id},
        {
            "$set": {
                "content": payload.content,
                "updated_at": utc_now(),
                "moderation_status": moderation_status,
                "moderation_reasons": moderation_reasons,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated_post is None:
        raise LookupError("Post not found or not owned by current user.")

    return serialize_post(updated_post, current_anonymous_id=anonymous_id)


def delete_post(post_id: str, user: dict) -> None:
    object_id = parse_object_id(post_id)
    if object_id is None:
        raise ValueError("Invalid post id.")

    anonymous_id = get_or_create_anonymous_id_for_user(user)
    result = posts_collection().delete_one({"_id": object_id, "anonymous_id": anonymous_id})
    if result.deleted_count == 0:
        raise LookupError("Post not found or not owned by current user.")
