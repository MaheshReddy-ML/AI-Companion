from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


MAX_CHAT_MESSAGE_LENGTH = 12_000
MAX_CONVERSATION_TITLE_LENGTH = 120
MAX_PERSONA_PROMPT_LENGTH = 4_000
CompanionMode = Literal["listen", "think", "reflect", "plan", "quiet", "deep"]


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ConversationCreateRequest(BaseModel):
    title: str = Field(default="New conversation", max_length=MAX_CONVERSATION_TITLE_LENGTH)
    pinned: bool = False
    character_id: str | None = Field(default=None, alias="characterId")
    character_name: str | None = Field(default=None, alias="characterName")
    persona_prompt: str | None = Field(default=None, alias="personaPrompt", max_length=MAX_PERSONA_PROMPT_LENGTH)
    starter_message: str | None = Field(default=None, alias="starterMessage", max_length=MAX_CHAT_MESSAGE_LENGTH)
    companion_mode: CompanionMode = Field(default="listen", alias="companionMode")

    model_config = ConfigDict(populate_by_name=True)


class ConversationUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=MAX_CONVERSATION_TITLE_LENGTH)
    pinned: bool | None = None
    character_id: str | None = Field(default=None, alias="characterId")
    character_name: str | None = Field(default=None, alias="characterName")
    persona_prompt: str | None = Field(default=None, alias="personaPrompt", max_length=MAX_PERSONA_PROMPT_LENGTH)
    companion_mode: CompanionMode | None = Field(default=None, alias="companionMode")

    model_config = ConfigDict(populate_by_name=True)


class ChatSendRequest(BaseModel):
    conversation_id: str | None = Field(default=None, alias="conversationId")
    message: str | None = Field(default=None, max_length=MAX_CHAT_MESSAGE_LENGTH)
    attachment_name: str | None = Field(default=None, alias="attachmentName", max_length=255)
    attachment_id: str | None = Field(default=None, alias="attachmentId", max_length=64)
    model: str | None = Field(default=None, max_length=200)
    persona_prompt: str | None = Field(default=None, alias="personaPrompt", max_length=MAX_PERSONA_PROMPT_LENGTH)
    character_id: str | None = Field(default=None, alias="characterId", max_length=100)
    character_name: str | None = Field(default=None, alias="characterName", max_length=120)
    companion_mode: CompanionMode | None = Field(default=None, alias="companionMode")
    # Captured only after an explicit browser permission and user action. The
    # server analyzes it in memory and persists a report, never image pixels.
    camera_opt_in: bool = Field(default=False, alias="cameraOptIn")
    camera_frame: str | None = Field(default=None, alias="cameraFrame", max_length=3_000_000)
    history: list[ChatHistoryMessage] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class AttachmentUploadRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    media_type: str = Field(alias="mediaType", min_length=1, max_length=100)
    data_url: str = Field(alias="dataUrl", min_length=1, max_length=7_000_000)

    model_config = ConfigDict(populate_by_name=True)
