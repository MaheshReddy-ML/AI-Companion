from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ConversationCreateRequest(BaseModel):
    title: str = "New conversation"
    pinned: bool = False
    character_id: str | None = Field(default=None, alias="characterId")
    character_name: str | None = Field(default=None, alias="characterName")
    persona_prompt: str | None = Field(default=None, alias="personaPrompt")
    starter_message: str | None = Field(default=None, alias="starterMessage")

    model_config = ConfigDict(populate_by_name=True)


class ConversationUpdateRequest(BaseModel):
    title: str | None = None
    pinned: bool | None = None
    character_id: str | None = Field(default=None, alias="characterId")
    character_name: str | None = Field(default=None, alias="characterName")
    persona_prompt: str | None = Field(default=None, alias="personaPrompt")

    model_config = ConfigDict(populate_by_name=True)


class ChatSendRequest(BaseModel):
    conversation_id: str | None = Field(default=None, alias="conversationId")
    message: str | None = None
    attachment_name: str | None = Field(default=None, alias="attachmentName")
    model: str | None = None
    api_key: str | None = Field(default=None, alias="apiKey")
    persona_prompt: str | None = Field(default=None, alias="personaPrompt")
    character_name: str | None = Field(default=None, alias="characterName")
    history: list[ChatHistoryMessage] = []

    model_config = ConfigDict(populate_by_name=True)
