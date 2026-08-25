from __future__ import annotations

import hashlib
import html
import hmac
import json
import re
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.audit import audit_event
from app.config import settings
from app.database import (
    attachments_collection,
    conversations_collection,
    feature_collection,
    memories_collection,
    parse_object_id,
    posts_collection,
    users_collection,
    to_iso,
    utc_now,
)
from app.security import get_current_user
from app.email_utils import send_email_html


router = APIRouter(prefix="/api/workspace", tags=["workspace"])
SEARCH_TYPES = {"conversation", "journal", "goal", "moment", "memory"}
FEEDBACK_REASONS = {"helpful", "too_long", "too_generic", "missed_request", "tone_wrong", "incorrect_or_unsafe"}
MAX_IMPORT_BYTES = 2 * 1024 * 1024


def _token_hash(request: Request) -> str:
    header = request.headers.get("authorization", "")
    token = header.split(" ", 1)[1].strip() if header.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="Active session token is required.")
    return hashlib.sha256(token.encode()).hexdigest()


def _client_label(request: Request) -> str:
    agent = request.headers.get("user-agent", "").lower()
    browser = "Safari" if "safari" in agent and "chrome" not in agent else "Chrome" if "chrome" in agent else "Firefox" if "firefox" in agent else "Browser"
    device = "Mobile" if "mobile" in agent else "Mac" if "macintosh" in agent else "Windows" if "windows" in agent else "Device"
    return f"{browser} on {device}"


def _record_security_event(user_id, kind: str, label: str) -> None:
    feature_collection("security_events").insert_one({"user_id": user_id, "kind": kind, "label": label, "created_at": utc_now()})


def _owned_conversation(user_id, conversation_id: str) -> dict:
    object_id = parse_object_id(conversation_id)
    conversation = conversations_collection().find_one({"_id": object_id, "user_id": user_id}) if object_id else None
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


class CollectionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class CollectionAssignmentRequest(BaseModel):
    conversation_id: str = Field(alias="conversationId", min_length=24, max_length=24)
    included: bool = True
    model_config = ConfigDict(populate_by_name=True)


class FeedbackRequest(BaseModel):
    conversation_id: str = Field(alias="conversationId", min_length=24, max_length=24)
    message_id: str = Field(alias="messageId", min_length=1, max_length=80)
    reason: str
    model_config = ConfigDict(populate_by_name=True)


class ShelfRequest(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    url: str = Field(min_length=8, max_length=2048)
    domain: str = Field(default="", max_length=253)
    note: str = Field(default="", max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=8)


class ShelfUpdateRequest(BaseModel):
    note: str = Field(default="", max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=8)


class ScheduleRequest(BaseModel):
    enabled: bool = False
    channel: str = Field(default="in_app", pattern="^(in_app|email)$")
    days: list[int] = Field(default_factory=lambda: [1, 3, 5], min_length=1, max_length=7)
    time: str = Field(default="18:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    timezone: str = Field(default="UTC", min_length=1, max_length=80)
    quiet_start: str = Field(default="21:00", alias="quietStart", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    quiet_end: str = Field(default="08:00", alias="quietEnd", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    model_config = ConfigDict(populate_by_name=True)


class RestoreRequest(BaseModel):
    export: dict
    mode: str = Field(default="merge", pattern="^(merge|replace)$")
    confirmation: str = Field(default="", max_length=40)


@router.get("/search")
def universal_search(
    q: str = Query(min_length=2, max_length=100),
    types: str = Query(default="conversation,journal,goal,moment,memory", max_length=100),
    limit: int = Query(default=30, ge=1, le=60),
    current_user: dict = Depends(get_current_user),
) -> dict:
    selected = [item for item in types.split(",") if item in SEARCH_TYPES]
    pattern = re.compile(re.escape(q.strip()), re.IGNORECASE)
    user_id = current_user["_id"]
    results: list[dict] = []

    def add(kind: str, item: dict, title: str, excerpt: str, path: str, date) -> None:
        results.append({"id": str(item["_id"]), "type": kind, "title": title[:160], "excerpt": excerpt[:260], "path": path, "date": to_iso(date)})

    if "conversation" in selected:
        for item in conversations_collection().find({"user_id": user_id, "$or": [{"title": pattern}, {"messages.content": pattern}]}).sort("updated_at", -1).limit(limit):
            matching = next((str(message.get("content", "")) for message in item.get("messages", []) if pattern.search(str(message.get("content", "")))), "")
            add("conversation", item, item.get("title", "Conversation"), matching, f"/chat?conversation={item['_id']}", item.get("updated_at"))
    if "journal" in selected:
        for item in feature_collection("journal_entries").find({"user_id": user_id, "$or": [{"title": pattern}, {"content": pattern}]}).sort("updated_at", -1).limit(limit):
            add("journal", item, item.get("title", "Journal entry"), item.get("content", ""), f"/journal?entry={item['_id']}", item.get("updated_at") or item.get("created_at"))
    if "goal" in selected:
        for item in feature_collection("goals").find({"user_id": user_id, "$or": [{"title": pattern}, {"note": pattern}]}).sort("created_at", -1).limit(limit):
            add("goal", item, item.get("title", "Goal"), item.get("note", ""), f"/goals?goal={item['_id']}", item.get("created_at"))
    if "moment" in selected:
        for item in feature_collection("emora_moments").find({"user_id": user_id, "$or": [{"quote": pattern}, {"note": pattern}]}).sort("created_at", -1).limit(limit):
            add("moment", item, item.get("note") or "Saved moment", item.get("quote", ""), f"/insights#insights-moments", item.get("created_at"))
    if "memory" in selected:
        for item in memories_collection().find({"user_id": user_id, "$or": [{"value": pattern}, {"label": pattern}]}).sort("updated_at", -1).limit(limit):
            add("memory", item, item.get("label", "Memory"), item.get("value", ""), "/profile#profile-companion", item.get("updated_at") or item.get("created_at"))
    results.sort(key=lambda item: item.get("date") or "", reverse=True)
    return {"query": q.strip(), "results": results[:limit], "deterministic": True}


@router.post("/sessions/register")
def register_session(request: Request, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now()
    token_hash = _token_hash(request)
    collection = feature_collection("auth_sessions")
    existing = collection.find_one({"user_id": current_user["_id"], "token_hash": token_hash})
    collection.update_one(
        {"user_id": current_user["_id"], "token_hash": token_hash},
        {"$set": {"label": _client_label(request), "last_activity_at": now, "revoked_at": None}, "$setOnInsert": {"user_id": current_user["_id"], "token_hash": token_hash, "created_at": now}},
        upsert=True,
    )
    if not existing:
        _record_security_event(current_user["_id"], "sign_in", f"Signed in with {_client_label(request)}")
    return {"registered": True}


@router.get("/sessions")
def list_sessions(request: Request, current_user: dict = Depends(get_current_user)) -> dict:
    current_hash = _token_hash(request)
    items = feature_collection("auth_sessions").find({"user_id": current_user["_id"], "revoked_at": None}).sort("last_activity_at", -1).limit(30)
    sessions = [{"id": str(item["_id"]), "label": item.get("label", "Browser session"), "createdAt": to_iso(item.get("created_at")), "lastActivityAt": to_iso(item.get("last_activity_at")), "current": item.get("token_hash") == current_hash} for item in items]
    events = feature_collection("security_events").find({"user_id": current_user["_id"]}).sort("created_at", -1).limit(20)
    return {"sessions": sessions, "events": [{"id": str(item["_id"]), "kind": item.get("kind"), "label": item.get("label"), "createdAt": to_iso(item.get("created_at"))} for item in events]}


@router.delete("/sessions/{session_id}")
def revoke_session(session_id: str, request: Request, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(session_id)
    current_hash = _token_hash(request)
    session = feature_collection("auth_sessions").find_one({"_id": object_id, "user_id": current_user["_id"]}) if object_id else None
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    feature_collection("auth_sessions").update_one({"_id": session["_id"]}, {"$set": {"revoked_at": utc_now()}})
    _record_security_event(current_user["_id"], "session_revoked", f"Revoked {session.get('label', 'a browser session')}")
    return {"message": "Session revoked.", "current": session.get("token_hash") == current_hash}


@router.delete("/sessions")
def revoke_other_sessions(request: Request, current_user: dict = Depends(get_current_user)) -> dict:
    current_hash = _token_hash(request)
    result = feature_collection("auth_sessions").update_many({"user_id": current_user["_id"], "token_hash": {"$ne": current_hash}, "revoked_at": None}, {"$set": {"revoked_at": utc_now()}})
    _record_security_event(current_user["_id"], "sessions_revoked", "Signed out other browser sessions")
    return {"message": "Other sessions revoked.", "count": result.modified_count}


def _serialize_collection(item: dict) -> dict:
    return {"id": str(item["_id"]), "name": item.get("name", "Collection"), "conversationIds": [str(value) for value in item.get("conversation_ids", [])], "createdAt": to_iso(item.get("created_at")), "updatedAt": to_iso(item.get("updated_at"))}


@router.get("/collections")
def list_collections(current_user: dict = Depends(get_current_user)) -> dict:
    items = feature_collection("conversation_collections").find({"user_id": current_user["_id"]}).sort("updated_at", -1).limit(100)
    return {"collections": [_serialize_collection(item) for item in items]}


@router.post("/collections", status_code=201)
def create_collection(payload: CollectionRequest, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now()
    document = {"user_id": current_user["_id"], "name": " ".join(payload.name.split()), "conversation_ids": [], "created_at": now, "updated_at": now}
    document["_id"] = feature_collection("conversation_collections").insert_one(document).inserted_id
    return {"collection": _serialize_collection(document)}


@router.patch("/collections/{collection_id}")
def rename_collection(collection_id: str, payload: CollectionRequest, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(collection_id)
    item = feature_collection("conversation_collections").find_one_and_update({"_id": object_id, "user_id": current_user["_id"]}, {"$set": {"name": " ".join(payload.name.split()), "updated_at": utc_now()}}, return_document=True) if object_id else None
    if not item:
        raise HTTPException(status_code=404, detail="Collection not found.")
    return {"collection": _serialize_collection(item)}


@router.put("/collections/{collection_id}/conversation")
def assign_collection(collection_id: str, payload: CollectionAssignmentRequest, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(collection_id)
    conversation = _owned_conversation(current_user["_id"], payload.conversation_id)
    update = {"$addToSet" if payload.included else "$pull": {"conversation_ids": conversation["_id"]}, "$set": {"updated_at": utc_now()}}
    item = feature_collection("conversation_collections").find_one_and_update({"_id": object_id, "user_id": current_user["_id"]}, update, return_document=True) if object_id else None
    if not item:
        raise HTTPException(status_code=404, detail="Collection not found.")
    return {"collection": _serialize_collection(item)}


@router.delete("/collections/{collection_id}")
def delete_collection(collection_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(collection_id)
    if not object_id or not feature_collection("conversation_collections").delete_one({"_id": object_id, "user_id": current_user["_id"]}).deleted_count:
        raise HTTPException(status_code=404, detail="Collection not found.")
    return {"message": "Collection deleted. Conversations were kept."}


@router.put("/feedback")
def save_feedback(payload: FeedbackRequest, current_user: dict = Depends(get_current_user)) -> dict:
    if payload.reason not in FEEDBACK_REASONS:
        raise HTTPException(status_code=400, detail="Unknown feedback reason.")
    conversation = _owned_conversation(current_user["_id"], payload.conversation_id)
    message = next((item for item in conversation.get("messages", []) if item.get("id") == payload.message_id and item.get("role") == "assistant"), None)
    if not message:
        raise HTTPException(status_code=404, detail="Emora response not found.")
    now = utc_now()
    feature_collection("response_feedback").update_one({"user_id": current_user["_id"], "conversation_id": conversation["_id"], "message_id": payload.message_id}, {"$set": {"reason": payload.reason, "updated_at": now}, "$setOnInsert": {"user_id": current_user["_id"], "conversation_id": conversation["_id"], "message_id": payload.message_id, "created_at": now}}, upsert=True)
    return {"saved": True, "reason": payload.reason, "storage": "server"}


def _validated_shelf(payload: ShelfRequest) -> tuple[str, str, list[str]]:
    parsed = urlparse(payload.url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Only valid HTTP or HTTPS links can be saved.")
    domain = parsed.hostname.lower().removeprefix("www.")
    tags = list(dict.fromkeys(" ".join(tag.split())[:30] for tag in payload.tags if tag.strip()))[:8]
    return payload.url.strip(), domain, tags


def _serialize_shelf(item: dict) -> dict:
    return {"id": str(item["_id"]), "title": item.get("title"), "url": item.get("url"), "domain": item.get("domain"), "note": item.get("note", ""), "tags": item.get("tags", []), "savedAt": to_iso(item.get("created_at")), "updatedAt": to_iso(item.get("updated_at")), "availability": "Saved link; availability is not guaranteed."}


@router.get("/research-shelf")
def list_research_shelf(current_user: dict = Depends(get_current_user)) -> dict:
    items = feature_collection("research_shelf").find({"user_id": current_user["_id"]}).sort("created_at", -1).limit(300)
    return {"items": [_serialize_shelf(item) for item in items]}


@router.post("/research-shelf", status_code=201)
def save_research_item(payload: ShelfRequest, current_user: dict = Depends(get_current_user)) -> dict:
    url, domain, tags = _validated_shelf(payload)
    now = utc_now()
    collection = feature_collection("research_shelf")
    collection.update_one({"user_id": current_user["_id"], "url": url}, {"$set": {"title": " ".join(payload.title.split()), "domain": domain, "note": payload.note.strip(), "tags": tags, "updated_at": now}, "$setOnInsert": {"user_id": current_user["_id"], "url": url, "created_at": now}}, upsert=True)
    return {"item": _serialize_shelf(collection.find_one({"user_id": current_user["_id"], "url": url}))}


@router.patch("/research-shelf/{item_id}")
def update_research_item(item_id: str, payload: ShelfUpdateRequest, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(item_id)
    tags = list(dict.fromkeys(" ".join(tag.split())[:30] for tag in payload.tags if tag.strip()))[:8]
    item = feature_collection("research_shelf").find_one_and_update({"_id": object_id, "user_id": current_user["_id"]}, {"$set": {"note": payload.note.strip(), "tags": tags, "updated_at": utc_now()}}, return_document=True) if object_id else None
    if not item:
        raise HTTPException(status_code=404, detail="Saved source not found.")
    return {"item": _serialize_shelf(item)}


@router.delete("/research-shelf/{item_id}")
def delete_research_item(item_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(item_id)
    if not object_id or not feature_collection("research_shelf").delete_one({"_id": object_id, "user_id": current_user["_id"]}).deleted_count:
        raise HTTPException(status_code=404, detail="Saved source not found.")
    return {"message": "Saved source removed."}


@router.get("/research-shelf/export")
def export_research_shelf(current_user: dict = Depends(get_current_user)) -> Response:
    payload = list_research_shelf(current_user)
    return Response(json.dumps(payload, ensure_ascii=False, indent=2), media_type="application/json", headers={"Content-Disposition": 'attachment; filename="emora-research-shelf.json"'})


@router.get("/schedule")
def read_schedule(current_user: dict = Depends(get_current_user)) -> dict:
    item = feature_collection("check_in_schedules").find_one({"user_id": current_user["_id"]}) or {}
    return {"schedule": {"enabled": bool(item.get("enabled", False)), "channel": item.get("channel", "in_app"), "days": item.get("days", [1, 3, 5]), "time": item.get("time", "18:00"), "timezone": item.get("timezone", "UTC"), "quietStart": item.get("quiet_start", "21:00"), "quietEnd": item.get("quiet_end", "08:00"), "updatedAt": to_iso(item.get("updated_at"))}}


@router.put("/schedule")
def save_schedule(payload: ScheduleRequest, current_user: dict = Depends(get_current_user)) -> dict:
    if any(day < 0 or day > 6 for day in payload.days):
        raise HTTPException(status_code=400, detail="Schedule days must be between 0 and 6.")
    if payload.channel == "email" and not current_user.get("email"):
        raise HTTPException(status_code=400, detail="An account email is required for email check-ins.")
    feature_collection("check_in_schedules").update_one({"user_id": current_user["_id"]}, {"$set": {"enabled": payload.enabled, "channel": payload.channel, "days": sorted(set(payload.days)), "time": payload.time, "timezone": payload.timezone.strip(), "quiet_start": payload.quiet_start, "quiet_end": payload.quiet_end, "updated_at": utc_now()}, "$setOnInsert": {"user_id": current_user["_id"], "created_at": utc_now()}}, upsert=True)
    audit_event("workspace.schedule.update", user_id=current_user["_id"], enabled=payload.enabled, channel=payload.channel)
    return read_schedule(current_user)


def _schedule_due(item: dict, now=None) -> tuple[bool, str]:
    try:
        local_now = (now or utc_now()).astimezone(ZoneInfo(item.get("timezone", "UTC")))
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=400, detail="Choose a valid IANA timezone such as Asia/Kolkata.") from exc
    date_key = local_now.date().isoformat()
    if not item.get("enabled") or local_now.isoweekday() % 7 not in item.get("days", []):
        return False, date_key
    hour, minute = map(int, item.get("time", "18:00").split(":"))
    scheduled = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    current_hm = local_now.strftime("%H:%M")
    quiet_start = item.get("quiet_start", "21:00")
    quiet_end = item.get("quiet_end", "08:00")
    in_quiet = (current_hm >= quiet_start or current_hm < quiet_end) if quiet_start > quiet_end else quiet_start <= current_hm < quiet_end
    return local_now >= scheduled and not in_quiet and item.get("last_acknowledged_date") != date_key, date_key


@router.get("/schedule/due")
def due_check_in(current_user: dict = Depends(get_current_user)) -> dict:
    item = feature_collection("check_in_schedules").find_one({"user_id": current_user["_id"]}) or {}
    due, date_key = _schedule_due(item)
    return {"due": due and item.get("channel", "in_app") == "in_app", "date": date_key, "message": "A gentle check-in is ready whenever you are."}


@router.post("/schedule/ack")
def acknowledge_check_in(current_user: dict = Depends(get_current_user)) -> dict:
    item = feature_collection("check_in_schedules").find_one({"user_id": current_user["_id"]}) or {}
    _, date_key = _schedule_due(item)
    feature_collection("check_in_schedules").update_one({"user_id": current_user["_id"]}, {"$set": {"last_acknowledged_date": date_key, "updated_at": utc_now()}})
    return {"acknowledged": True}


def _unsubscribe_token(user_id) -> str:
    return hmac.new(settings.secret_key.encode(), f"check-in-unsubscribe:{user_id}".encode(), hashlib.sha256).hexdigest()


@router.get("/schedule/unsubscribe", response_class=Response)
def unsubscribe_check_ins(user: str = Query(min_length=24, max_length=24), token: str = Query(min_length=64, max_length=64)) -> Response:
    user_id = parse_object_id(user)
    if not user_id or not hmac.compare_digest(token, _unsubscribe_token(user_id)):
        raise HTTPException(status_code=400, detail="This unsubscribe link is invalid.")
    feature_collection("check_in_schedules").update_one({"user_id": user_id}, {"$set": {"enabled": False, "updated_at": utc_now()}})
    return Response("<!doctype html><meta name='viewport' content='width=device-width'><title>Emora check-ins paused</title><main style='font-family:Arial,sans-serif;max-width:560px;margin:12vh auto;padding:32px'><h1>Check-ins paused</h1><p>Your scheduled Emora check-ins are now off. You can explicitly enable them again from Profile.</p></main>", media_type="text/html")


def deliver_due_email_check_ins() -> int:
    """Deliver opted-in email schedules; safe for a periodic background call."""
    delivered = 0
    schedules = feature_collection("check_in_schedules").find({"enabled": True, "channel": "email"}).limit(500)
    for item in schedules:
        try:
            due, date_key = _schedule_due(item)
            user = users_collection().find_one({"_id": item.get("user_id")}) if due else None
            recipient = str((user or {}).get("email") or "")
            if not recipient:
                continue
            name = html.escape(str(user.get("name") or "there"))
            unsubscribe_url = f"{settings.public_app_url}/api/workspace/schedule/unsubscribe?user={user['_id']}&token={_unsubscribe_token(user['_id'])}"
            sent = send_email_html(recipient, "A gentle check-in from Emora", f"<main style='font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px'><p style='color:#7357c7;font-weight:700'>EMORA CHECK-IN</p><h1 style='font-size:28px'>A quiet moment for you, {name}.</h1><p>How are you arriving today? There is nothing you need to solve—this is simply the check-in you explicitly scheduled.</p><p>Open Emora when you are ready.</p><small><a href='{unsubscribe_url}'>Pause these check-ins in one click</a>. You can also change the schedule anytime in Profile.</small></main>", f"A gentle Emora check-in is ready. Open your account when you are ready. Pause future check-ins: {unsubscribe_url}")
            if sent:
                feature_collection("check_in_schedules").update_one({"_id": item["_id"]}, {"$set": {"last_acknowledged_date": date_key, "last_delivered_at": utc_now()}})
                delivered += 1
        except Exception:
            continue
    return delivered


@router.get("/privacy-summary")
def privacy_summary(current_user: dict = Depends(get_current_user)) -> dict:
    user_id = current_user["_id"]
    counts = {
        "conversations": conversations_collection().count_documents({"user_id": user_id}),
        "journalEntries": feature_collection("journal_entries").count_documents({"user_id": user_id}),
        "goals": feature_collection("goals").count_documents({"user_id": user_id}),
        "moments": feature_collection("emora_moments").count_documents({"user_id": user_id}),
        "memories": memories_collection().count_documents({"user_id": user_id}),
        "attachments": attachments_collection().count_documents({"user_id": user_id}),
        "communityPosts": posts_collection().count_documents({"anonymous_id": current_user.get("anonymous_id")}) if current_user.get("anonymous_id") else 0,
        "collections": feature_collection("conversation_collections").count_documents({"user_id": user_id}),
        "savedResearch": feature_collection("research_shelf").count_documents({"user_id": user_id}),
    }
    return {"counts": counts, "storage": {"deviceLocal": ["Unsent chat drafts", "Unsent journal draft", "Theme preference"], "serverSynced": ["Account profile", "Conversations", "Journal", "Goals", "Moments", "Memories", "Preferences", "Collections", "Saved research"]}, "retention": {"accountData": "Kept until you delete the item or account.", "drafts": "Device-local drafts expire after 30 days.", "cameraFrames": "Never persisted."}}


def _restore_counts(payload: dict) -> dict:
    return {key: len(payload.get(key, [])) if isinstance(payload.get(key), list) else 0 for key in ("conversations", "journalEntries", "goals", "memories", "conversationCollections", "savedResearch")}


def _validate_restore(payload: dict) -> None:
    if payload.get("format") != "emora-account-export.v1":
        raise HTTPException(status_code=400, detail="Unsupported Emora export format.")
    if len(json.dumps(payload, ensure_ascii=False).encode()) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="Keep restore files under 2 MB.")
    for key in ("conversations", "journalEntries", "goals", "memories", "conversationCollections", "savedResearch"):
        if key in payload and not isinstance(payload[key], list):
            raise HTTPException(status_code=400, detail=f"Invalid {key} collection in export.")


@router.post("/restore/preview")
def preview_restore(payload: RestoreRequest, current_user: dict = Depends(get_current_user)) -> dict:
    _validate_restore(payload.export)
    return {"valid": True, "format": payload.export["format"], "counts": _restore_counts(payload.export), "mode": payload.mode, "writesPerformed": False}


@router.post("/restore/commit")
def commit_restore(payload: RestoreRequest, current_user: dict = Depends(get_current_user)) -> dict:
    _validate_restore(payload.export)
    if payload.mode == "replace" and payload.confirmation != "REPLACE MY DATA":
        raise HTTPException(status_code=400, detail="Type REPLACE MY DATA to confirm replacement.")
    user_id = current_user["_id"]
    if payload.mode == "replace":
        conversations_collection().delete_many({"user_id": user_id})
        for name in ("journal_entries", "goals", "conversation_collections", "research_shelf"):
            feature_collection(name).delete_many({"user_id": user_id})
        memories_collection().delete_many({"user_id": user_id})
    now = utc_now()
    written = {"conversations": 0, "journalEntries": 0, "goals": 0, "memories": 0, "conversationCollections": 0, "savedResearch": 0}
    restored_conversation_ids = {}
    for raw in payload.export.get("conversations", [])[:500]:
        if not isinstance(raw, dict): continue
        document = {"user_id": user_id, "title": str(raw.get("title") or "Restored conversation")[:120], "pinned": bool(raw.get("pinned")), "character_name": str(raw.get("characterName") or "Emora")[:120], "companion_mode": str(raw.get("companionMode") or "listen"), "messages": [], "created_at": now, "updated_at": now, "version": 1}
        for message in raw.get("messages", [])[:1000]:
            if isinstance(message, dict) and message.get("role") in {"user", "assistant"} and str(message.get("content", "")).strip():
                document["messages"].append({"id": f"restored-{hashlib.sha256((str(message.get('id')) + str(message.get('content'))).encode()).hexdigest()[:24]}", "role": message["role"], "content": str(message["content"])[:12000], "timestamp": now})
        result = conversations_collection().insert_one(document)
        if raw.get("id"): restored_conversation_ids[str(raw["id"])] = result.inserted_id
        written["conversations"] += 1
    for raw in payload.export.get("journalEntries", [])[:1000]:
        if isinstance(raw, dict) and str(raw.get("content", "")).strip():
            feature_collection("journal_entries").insert_one({"user_id": user_id, "title": str(raw.get("title") or "Restored reflection")[:120], "content": str(raw["content"])[:6000], "mood": str(raw.get("mood") or "reflective")[:30], "created_at": now, "updated_at": now, "version": 1}); written["journalEntries"] += 1
    for raw in payload.export.get("goals", [])[:1000]:
        if isinstance(raw, dict) and str(raw.get("title", "")).strip():
            feature_collection("goals").insert_one({"user_id": user_id, "title": str(raw["title"])[:160], "note": str(raw.get("note") or "")[:500], "completed": bool(raw.get("completed")), "created_at": now, "version": 1}); written["goals"] += 1
    for raw in payload.export.get("memories", [])[:1000]:
        if isinstance(raw, dict) and str(raw.get("value", "")).strip():
            value = str(raw["value"])[:300]
            key = "restored:" + hashlib.sha256(value.casefold().encode()).hexdigest()[:24]
            memories_collection().update_one({"user_id": user_id, "key": key}, {"$setOnInsert": {"user_id": user_id, "category": str(raw.get("category") or "restored")[:40], "key": key, "value": value, "source": "account_restore", "created_at": now, "updated_at": now}}, upsert=True); written["memories"] += 1
    for raw in payload.export.get("conversationCollections", [])[:100]:
        if isinstance(raw, dict) and str(raw.get("name", "")).strip():
            ids = [restored_conversation_ids[value] for value in map(str, raw.get("conversationIds", [])) if value in restored_conversation_ids]
            feature_collection("conversation_collections").insert_one({"user_id": user_id, "name": str(raw["name"])[:60], "conversation_ids": ids, "created_at": now, "updated_at": now})
            written["conversationCollections"] += 1
    for raw in payload.export.get("savedResearch", [])[:300]:
        if not isinstance(raw, dict): continue
        parsed = urlparse(str(raw.get("url", "")))
        if parsed.scheme not in {"http", "https"} or not parsed.hostname: continue
        url = str(raw["url"])[:2048]
        feature_collection("research_shelf").update_one({"user_id": user_id, "url": url}, {"$set": {"title": str(raw.get("title") or parsed.hostname)[:180], "domain": parsed.hostname.lower().removeprefix("www."), "note": str(raw.get("note") or "")[:500], "tags": [str(tag)[:30] for tag in raw.get("tags", [])[:8]], "updated_at": now}, "$setOnInsert": {"user_id": user_id, "url": url, "created_at": now}}, upsert=True)
        written["savedResearch"] += 1
    schedule = payload.export.get("checkInSchedule")
    if isinstance(schedule, dict) and schedule.get("time"):
        feature_collection("check_in_schedules").update_one({"user_id": user_id}, {"$set": {"enabled": bool(schedule.get("enabled")), "channel": schedule.get("channel") if schedule.get("channel") in {"in_app", "email"} else "in_app", "days": [day for day in schedule.get("days", []) if isinstance(day, int) and 0 <= day <= 6] or [1, 3, 5], "time": str(schedule.get("time"))[:5], "timezone": str(schedule.get("timezone") or "UTC")[:80], "quiet_start": "21:00", "quiet_end": "08:00", "updated_at": now}, "$setOnInsert": {"user_id": user_id, "created_at": now}}, upsert=True)
    _record_security_event(user_id, "account_restore", f"Restored account data using {payload.mode} mode")
    audit_event("account.restore", user_id=user_id, mode=payload.mode, **written)
    return {"restored": True, "mode": payload.mode, "written": written}
