from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.schemas import PostCreateRequest, PostCreateResponse, PostLikeResponse, PostResponse
from app.security import get_current_user
from app.services.posts import create_post, like_post, list_posts


router = APIRouter(prefix="/posts", tags=["posts"])


@router.post("", response_model=PostCreateResponse, status_code=status.HTTP_201_CREATED)
def create_post_route(payload: PostCreateRequest, current_user: dict = Depends(get_current_user)) -> dict:
    post = create_post(payload, current_user)
    return {
        "message": "Post created successfully.",
        "post": post,
    }


@router.get("", response_model=list[PostResponse])
def get_posts_route(_: dict = Depends(get_current_user)) -> list[dict]:
    return list_posts()


@router.post("/{post_id}/like", response_model=PostLikeResponse)
def like_post_route(post_id: str, _: dict = Depends(get_current_user)) -> dict:
    try:
        post = like_post(post_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {
        "message": "Post liked successfully.",
        "post": post,
    }
