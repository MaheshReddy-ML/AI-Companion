from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.audit import audit_event
from app.models.schemas import (
    PostCreateRequest,
    PostCreateResponse,
    PostLikeResponse,
    PostListResponse,
    PostReportRequest,
    PostUpdateRequest,
    PostUpdateResponse,
)
from app.rate_limit import rate_limit
from app.security import get_current_user
from app.services.posts import create_post, delete_post, like_post, list_posts, report_post, update_post


router = APIRouter(prefix="/posts", tags=["posts"])


@router.post(
    "",
    response_model=PostCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit(12, 300, "posts-create"))],
)
def create_post_route(payload: PostCreateRequest, current_user: dict = Depends(get_current_user)) -> dict:
    post = create_post(payload, current_user)
    audit_event("posts.create.success", user_id=current_user["_id"], post_id=post["_id"], status=post["moderation_status"])
    return {
        "message": "Post created successfully.",
        "post": post,
    }


@router.get("", response_model=PostListResponse)
def get_posts_route(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
) -> dict:
    return list_posts(current_user, page=page, limit=limit)


@router.post("/{post_id}/like", response_model=PostLikeResponse, dependencies=[Depends(rate_limit(60, 300, "posts-like"))])
def like_post_route(post_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    try:
        post = like_post(post_id, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    audit_event("posts.like.success", user_id=current_user["_id"], post_id=post_id)
    return {
        "message": "Post liked successfully.",
        "post": post,
    }


@router.post("/{post_id}/report", dependencies=[Depends(rate_limit(12, 300, "posts-report"))])
def report_post_route(
    post_id: str,
    payload: PostReportRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        report_post(post_id, payload, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    audit_event("posts.report.success", user_id=current_user["_id"], post_id=post_id, reason=payload.reason)
    return {"message": "Thank you. This reflection was privately sent for review."}


@router.patch("/{post_id}", response_model=PostUpdateResponse, dependencies=[Depends(rate_limit(20, 300, "posts-update"))])
def update_post_route(
    post_id: str,
    payload: PostUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        post = update_post(post_id, payload, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    audit_event("posts.update.success", user_id=current_user["_id"], post_id=post_id, status=post["moderation_status"])
    return {"message": "Post updated successfully.", "post": post}


@router.delete("/{post_id}")
def delete_post_route(post_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    try:
        delete_post(post_id, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    audit_event("posts.delete.success", user_id=current_user["_id"], post_id=post_id)
    return {"message": "Post deleted successfully."}
