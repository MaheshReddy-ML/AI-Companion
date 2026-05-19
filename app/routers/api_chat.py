from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.database import conversations_collection, parse_object_id, serialize_conversation, serialize_message, utc_now
from app.models.schemas import ChatSendRequest, ConversationCreateRequest, ConversationUpdateRequest
from app.security import get_current_user
from app.services.openai_chat import get_openai_reply


router = APIRouter(prefix="/api/chat", tags=["chat"])


def create_chat_title(text: str) -> str:
    cleaned = " ".join(text.split()).strip()
    if not cleaned:
        return "New conversation"
    return f"{cleaned[:52]}..." if len(cleaned) > 52 else cleaned


def build_message(role: str, content: str, attachment_name: str | None = None) -> dict:
    return {
        "id": f"msg-{uuid4().hex}",
        "role": role,
        "content": content,
        "attachment_name": attachment_name,
        "timestamp": utc_now(),
    }


def build_conversation_document(user_id, payload: ConversationCreateRequest) -> dict:
    now = utc_now()
    messages: list[dict] = []
    if payload.starter_message:
        messages.append(build_message("assistant", payload.starter_message.strip()))

    title = payload.title.strip() or "New conversation"
    return {
        "user_id": user_id,
        "title": title,
        "pinned": payload.pinned,
        "character_id": payload.character_id,
        "character_name": payload.character_name,
        "persona_prompt": payload.persona_prompt,
        "messages": messages,
        "created_at": now,
        "updated_at": messages[-1]["timestamp"] if messages else now,
    }


def get_user_conversation_or_404(conversation_id: str, user_id) -> dict:
    object_id = parse_object_id(conversation_id)
    if object_id is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation = conversations_collection().find_one({"_id": object_id, "user_id": user_id})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.get("")
def get_conversations(current_user: dict = Depends(get_current_user)) -> list[dict]:
    cursor = conversations_collection().find({"user_id": current_user["_id"]}).sort("updated_at", -1)
    return [serialize_conversation(document) for document in cursor]


@router.post("/conversations")
def create_conversation(payload: ConversationCreateRequest, current_user: dict = Depends(get_current_user)) -> dict:
    document = build_conversation_document(current_user["_id"], payload)
    inserted = conversations_collection().insert_one(document)
    document["_id"] = inserted.inserted_id
    return serialize_conversation(document)


@router.patch("/conversations/{conversation_id}")
def update_conversation(
    conversation_id: str,
    payload: ConversationUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    conversation = get_user_conversation_or_404(conversation_id, current_user["_id"])

    updates = {}
    if payload.title is not None:
        updates["title"] = payload.title.strip() or conversation.get("title", "New conversation")
    if payload.pinned is not None:
        updates["pinned"] = payload.pinned
    if payload.character_id is not None:
        updates["character_id"] = payload.character_id
    if payload.character_name is not None:
        updates["character_name"] = payload.character_name
    if payload.persona_prompt is not None:
        updates["persona_prompt"] = payload.persona_prompt

    updates["updated_at"] = utc_now()
    conversations_collection().update_one({"_id": conversation["_id"]}, {"$set": updates})
    conversation.update(updates)
    return serialize_conversation(conversation)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    conversation = get_user_conversation_or_404(conversation_id, current_user["_id"])
    conversations_collection().delete_one({"_id": conversation["_id"]})
    return {"message": "Conversation deleted"}


@router.post("")
async def send_message(payload: ChatSendRequest, current_user: dict = Depends(get_current_user)) -> dict:
    message_text = (payload.message or "").strip()
    attachment_name = (payload.attachment_name or "").strip() or None

    if not message_text and not attachment_name:
        raise HTTPException(status_code=400, detail="Message is required")

    outgoing_content = message_text or f"Shared file: {attachment_name}"
    user_message = build_message("user", outgoing_content, attachment_name)

    conversations = conversations_collection()
    conversation: dict | None = None
    if payload.conversation_id:
        conversation = get_user_conversation_or_404(payload.conversation_id, current_user["_id"])

    if conversation is None:
        now = utc_now()
        conversation = {
            "user_id": current_user["_id"],
            "title": create_chat_title(outgoing_content),
            "pinned": False,
            "character_id": None,
            "character_name": payload.character_name,
            "persona_prompt": payload.persona_prompt,
            "messages": [],
            "created_at": now,
            "updated_at": now,
        }

    if payload.character_name is not None:
        conversation["character_name"] = payload.character_name
    if payload.persona_prompt is not None:
        conversation["persona_prompt"] = payload.persona_prompt

    if not conversation.get("messages") or conversation.get("title") == "New conversation":
        conversation["title"] = create_chat_title(outgoing_content)

    history_source = conversation.get("messages") or [
        {"role": item.role, "content": item.content}
        for item in payload.history
        if item.content.strip()
    ]

    conversation.setdefault("messages", [])
    conversation["messages"].append(user_message)
    conversation["updated_at"] = user_message["timestamp"]

    warning: str | None = None
    resolved_model = payload.model or ""

    try:
        assistant_text, resolved_model = await get_openai_reply(
            message=outgoing_content,
            history=history_source,
            model=payload.model,
            api_key=payload.api_key,
            persona_prompt=conversation.get("persona_prompt"),
        )
    except ValueError as exc:
        warning = str(exc)
        assistant_text = f"I could not complete that request. {warning}"

    assistant_message = build_message("assistant", assistant_text)
    conversation["messages"].append(assistant_message)
    conversation["updated_at"] = assistant_message["timestamp"]

    if conversation.get("_id"):
        conversations.replace_one({"_id": conversation["_id"]}, conversation)
    else:
        inserted = conversations.insert_one(conversation)
        conversation["_id"] = inserted.inserted_id

    return {
        "conversation": serialize_conversation(conversation),
        "userMessage": serialize_message(user_message),
        "aiMessage": {
            **serialize_message(assistant_message),
            "message": assistant_message["content"],
        },
        "model": resolved_model,
        "warning": warning,
    }
