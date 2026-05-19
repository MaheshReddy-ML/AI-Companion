from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


MAX_POST_CONTENT_LENGTH = 2000


class PostCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_POST_CONTENT_LENGTH)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Post content cannot be empty.")
        return cleaned


class PostResponse(BaseModel):
    id: str = Field(alias="_id")
    content: str
    created_at: str
    likes: int = 0

    model_config = ConfigDict(populate_by_name=True)


class PostCreateResponse(BaseModel):
    message: str
    post: PostResponse


class PostLikeResponse(BaseModel):
    message: str
    post: PostResponse
