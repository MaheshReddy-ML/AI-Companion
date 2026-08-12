from __future__ import annotations

import re
import json
import asyncio
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse, PlainTextResponse

from app.audit import audit_event
from app.companion import account_profile_prompt_context, analyze_emotion, behavior_report, companion_emotion_for_avatar, memory_prompt_context, vision_prompt_context
from app.config import settings
from app.companion_brain import build_companion_brain
from app.database import attachments_collection, conversations_collection, parse_object_id, serialize_conversation, serialize_message, utc_now
from app.models.schemas import AttachmentUploadRequest, ChatSendRequest, ConversationCreateRequest, ConversationUpdateRequest
from app.rate_limit import rate_limit
from app.security import get_current_user
from app.services.companion_chat import get_companion_reply
from app.services.local_mlx_chat import local_mlx_chat
from app.services.companion_memory import retrieve_memories, save_memory_candidates
from app.services.attachments import create_attachment, delete_attachments_for_conversations, get_attachment_or_404
from app.services.local_mlx_vision import VisionAnalysisError, local_mlx_vision


router = APIRouter(prefix="/api/chat", tags=["chat"])


def create_chat_title(text: str) -> str:
    cleaned = " ".join(text.split()).strip()
    if not cleaned:
        return "New conversation"
    return f"{cleaned[:52]}..." if len(cleaned) > 52 else cleaned


def build_message(role: str, content: str, attachment_name: str | None = None, attachment_id=None) -> dict:
    return {
        "id": f"msg-{uuid4().hex}",
        "role": role,
        "content": content,
        "attachment_name": attachment_name,
        "attachment_id": attachment_id,
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
def get_conversations(
    response: Response,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    search: str | None = Query(default=None, max_length=100),
    pinned: bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    query: dict = {"user_id": current_user["_id"]}
    if pinned is not None:
        query["pinned"] = pinned
    if search and search.strip():
        pattern = re.compile(re.escape(search.strip()), re.IGNORECASE)
        query["$or"] = [
            {"title": pattern},
            {"character_name": pattern},
            {"messages.content": pattern},
        ]

    safe_page = max(1, page)
    safe_limit = min(100, max(1, limit))
    total = conversations_collection().count_documents(query)
    cursor = (
        conversations_collection()
        .find(query)
        .sort("updated_at", -1)
        .skip((safe_page - 1) * safe_limit)
        .limit(safe_limit)
    )
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(safe_page)
    response.headers["X-Limit"] = str(safe_limit)
    response.headers["X-Has-More"] = "true" if safe_page * safe_limit < total else "false"
    return [serialize_conversation(document) for document in cursor]


@router.post("/conversations")
def create_conversation(payload: ConversationCreateRequest, current_user: dict = Depends(get_current_user)) -> dict:
    document = build_conversation_document(current_user["_id"], payload)
    inserted = conversations_collection().insert_one(document)
    document["_id"] = inserted.inserted_id
    audit_event("chat.conversation.create", user_id=current_user["_id"], conversation_id=document["_id"])
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
    audit_event("chat.conversation.update", user_id=current_user["_id"], conversation_id=conversation["_id"])
    return serialize_conversation(conversation)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    conversation = get_user_conversation_or_404(conversation_id, current_user["_id"])
    delete_attachments_for_conversations([conversation["_id"]])
    conversations_collection().delete_one({"_id": conversation["_id"]})
    audit_event("chat.conversation.delete", user_id=current_user["_id"], conversation_id=conversation["_id"])
    return {"message": "Conversation deleted"}


@router.get("/conversations/{conversation_id}/export")
def export_conversation(
    conversation_id: str,
    format: str = Query(default="json", pattern="^(json|text)$"),
    current_user: dict = Depends(get_current_user),
) -> Response:
    """Export a user's conversation without exposing it to another account."""
    conversation = get_user_conversation_or_404(conversation_id, current_user["_id"])
    serialized = serialize_conversation(conversation)
    filename_base = re.sub(r"[^a-z0-9]+", "-", serialized["title"].lower()).strip("-") or "conversation"

    if format == "json":
        content = json.dumps(serialized, ensure_ascii=False, indent=2)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.json"'},
        )

    lines = [f"# {serialized['title']}", ""]
    for message in serialized["messages"]:
        speaker = "You" if message["role"] == "user" else serialized.get("characterName") or "AI Companion"
        timestamp = message.get("timestamp") or ""
        lines.extend([f"{speaker} {f'({timestamp})' if timestamp else ''}", message["content"], ""])
    return PlainTextResponse(
        "\n".join(lines),
        headers={"Content-Disposition": f'attachment; filename="{filename_base}.txt"'},
    )


@router.post("/attachments", status_code=201, dependencies=[Depends(rate_limit(12, 300, "chat-attachment"))])
def upload_attachment(payload: AttachmentUploadRequest, current_user: dict = Depends(get_current_user)) -> dict:
    attachment = create_attachment(
        user_id=current_user["_id"],
        name=payload.name,
        media_type=payload.media_type,
        data_url=payload.data_url,
    )
    audit_event("chat.attachment.upload", user_id=current_user["_id"], attachment_id=attachment["id"])
    return {"attachment": attachment}


@router.get("/attachments/{attachment_id}")
def download_attachment(attachment_id: str, current_user: dict = Depends(get_current_user)) -> FileResponse:
    attachment = get_attachment_or_404(attachment_id, current_user["_id"])
    path = attachment["path"]
    if not Path(path).is_file():
        raise HTTPException(status_code=404, detail="Attachment file is no longer available.")
    return FileResponse(path, media_type=attachment["media_type"], filename=attachment["name"], headers={"Cache-Control": "private, no-store"})


@router.post("", dependencies=[Depends(rate_limit(30, 300, "chat-send"))])
async def send_message(payload: ChatSendRequest, current_user: dict = Depends(get_current_user)) -> dict:
    message_text = (payload.message or "").strip()
    attachment_name = (payload.attachment_name or "").strip() or None
    attachment_id = parse_object_id(payload.attachment_id or "") if payload.attachment_id else None

    if not message_text and not attachment_name:
        raise HTTPException(status_code=400, detail="Message is required")

    if payload.attachment_id and attachment_id is None:
        raise HTTPException(status_code=400, detail="Invalid attachment id")
    if attachment_id:
        attachment = attachments_collection().find_one({"_id": attachment_id, "user_id": current_user["_id"]})
        if not attachment:
            raise HTTPException(status_code=404, detail="Attachment not found")
        attachment_name = attachment["name"]

    outgoing_content = message_text or f"Shared file: {attachment_name}"
    user_message = build_message("user", outgoing_content, attachment_name, attachment_id)
    user_analysis = analyze_emotion(outgoing_content)
    user_message["analysis"] = user_analysis
    vision: dict | None = None
    vision_warning: str | None = None
    if payload.camera_frame:
        if not payload.camera_opt_in:
            raise HTTPException(status_code=400, detail="Camera analysis requires explicit opt-in.")
        try:
            vision = await asyncio.to_thread(
                local_mlx_vision.analyze,
                model_id=settings.vision_mlx_model,
                data_url=payload.camera_frame,
                max_tokens=settings.vision_mlx_max_tokens,
            )
            user_message["vision"] = vision
        except VisionAnalysisError as exc:
            # A camera failure never blocks a text conversation and never saves pixels.
            vision_warning = str(exc)
    user_message["behavior_report"] = behavior_report(user_analysis, vision)
    relevant_memories = retrieve_memories(current_user["_id"], outgoing_content)

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
    if payload.character_id is not None:
        conversation["character_id"] = payload.character_id
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

    warning: str | None = vision_warning
    resolved_model = payload.model or ""

    try:
        assistant_text, raw_brain, resolved_model = await get_companion_reply(
            message=outgoing_content,
            history=history_source,
            model=payload.model,
            persona_prompt=conversation.get("persona_prompt"),
            character_id=conversation.get("character_id") or payload.character_id,
            companion_context="\n\n".join(filter(None, [
                account_profile_prompt_context(current_user),
                memory_prompt_context(relevant_memories, user_analysis),
                vision_prompt_context(vision),
            ])),
        )
    except ValueError as exc:
        warning = str(exc)
        audit_event("chat.reply.failed", user_id=current_user["_id"], reason=warning)
        assistant_text = f"I could not complete that request. {warning}"
        raw_brain = {}

    brain = build_companion_brain(
        reply=assistant_text,
        raw_brain=raw_brain,
        message=outgoing_content,
        history=history_source,
        character_name=conversation.get("character_name") or payload.character_name,
    )
    # The response controls the avatar; make the user's detected state explicit
    # so it can choose a comforting/curious posture rather than only guessing
    # from the generated reply text.
    brain["emotion"]["primary"] = companion_emotion_for_avatar(user_analysis)
    brain["emotion"]["label"] = brain["emotion"]["primary"]
    brain["userEmotion"] = user_analysis
    brain["memory"]["relevant"] = relevant_memories
    assistant_message = build_message("assistant", assistant_text)
    assistant_message["brain"] = brain
    conversation["messages"].append(assistant_message)
    conversation["updated_at"] = assistant_message["timestamp"]

    if conversation.get("_id"):
        conversations.replace_one({"_id": conversation["_id"]}, conversation)
    else:
        inserted = conversations.insert_one(conversation)
        conversation["_id"] = inserted.inserted_id

    saved_memories = save_memory_candidates(current_user["_id"], outgoing_content, user_message["id"])

    if attachment_id:
        attachments_collection().update_one(
            {"_id": attachment_id, "user_id": current_user["_id"]},
            {"$set": {"conversation_id": conversation["_id"]}},
        )

    audit_event("chat.message.saved", user_id=current_user["_id"], conversation_id=conversation["_id"], warning=warning)
    response_payload = {
        "conversation": serialize_conversation(conversation),
        "userMessage": serialize_message(user_message),
        "aiMessage": {
            **serialize_message(assistant_message),
            "message": assistant_message["content"],
            "brain": brain,
        },
        "brain": brain,
        "model": resolved_model,
        "warning": warning,
        "behaviorReport": user_message["behavior_report"],
        "memoriesSaved": len(saved_memories),
    }
    if settings.companion_debug:
        response_payload["generationStats"] = local_mlx_chat.runtime_stats()
    return response_payload
