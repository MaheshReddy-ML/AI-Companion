from __future__ import annotations

from datetime import timedelta
from secrets import choice
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.avatar_catalog import resolve_avatar_payload
from app.database import as_utc, feature_collection, parse_object_id, to_iso, users_collection, utc_now
from app.notifications import create_notification
from app.rate_limit import rate_limit
from app.security import get_current_user


router = APIRouter(prefix="/api/together", tags=["together"])
PRESENCE_FRESH_SECONDS = 75
PRESENCE_TTL_SECONDS = 120
MAX_CIRCLE_MEMBERS = 8

ACTIVITY_CATALOG = {
    "question": (
        "What made you smile recently that the others may not know about?",
        "What is one small thing you would love for this circle to do together?",
        "Which ordinary moment from this week deserves a replay?",
        "What is something you are quietly looking forward to?",
    ),
    "would_you_rather": (
        "Would you rather plan a surprise day out or discover it as you go?",
        "Would you rather share one long adventure or twelve tiny monthly adventures?",
        "Would you rather have a group soundtrack or a group photo wall?",
        "Would you rather revisit a favorite memory or create a completely new tradition?",
    ),
    "gratitude": (
        "Name one thing someone in this circle did that you appreciated.",
        "Share one quality this circle brings out in you.",
        "What is one small way this group made a difficult day lighter?",
    ),
    "quick_pick": (
        "Pick tonight's shared vibe: cozy, chaotic, curious, or focused.",
        "Choose the next mini-plan: music break, five-minute check-in, focus sprint, or memory swap.",
        "Pick one: voice call, shared focus, question round, or quiet company.",
    ),
}


class FriendRequestCreate(BaseModel):
    email: EmailStr


class FriendRequestResponse(BaseModel):
    response: str = Field(pattern="^(accept|decline)$")


class PresenceUpdate(BaseModel):
    visibility: str = Field(default="online", pattern="^(online|away|hidden)$")


class CircleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    kind: str = Field(pattern="^(duo|couple|group)$")
    member_ids: list[str] = Field(alias="memberIds", min_length=1, max_length=7)
    model_config = ConfigDict(populate_by_name=True)


class CircleMemberAdd(BaseModel):
    member_id: str = Field(alias="memberId", min_length=24, max_length=24)
    model_config = ConfigDict(populate_by_name=True)


class CircleMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class CircleActivityCreate(BaseModel):
    activity_type: str = Field(alias="activityType")
    model_config = ConfigDict(populate_by_name=True)


class CircleActivityResponse(BaseModel):
    response: str = Field(min_length=1, max_length=160)


def _pair_key(first, second) -> str:
    return ":".join(sorted((str(first), str(second))))


def _friendships():
    return feature_collection("friendships")


def _circles():
    return feature_collection("social_circles")


def _presence():
    return feature_collection("social_presence")


def _public_person(user: dict, *, presence: dict | None = None) -> dict:
    visibility = str((presence or {}).get("visibility") or "hidden")
    fresh = bool(presence and presence.get("last_seen_at") and as_utc(presence["last_seen_at"]) >= utc_now() - timedelta(seconds=PRESENCE_FRESH_SECONDS))
    status = visibility if fresh and visibility in {"online", "away"} else "offline"
    return {
        "id": str(user["_id"]),
        "name": user.get("name") or "Emora friend",
        "presence": status,
        "lastSeenAt": to_iso(presence.get("last_seen_at")) if presence and status != "offline" else None,
        **resolve_avatar_payload(user),
    }


def _user_map(user_ids: set) -> dict:
    if not user_ids:
        return {}
    return {str(item["_id"]): item for item in users_collection().find({"_id": {"$in": list(user_ids)}})}


def _presence_map(user_ids: set) -> dict:
    if not user_ids:
        return {}
    return {str(item["user_id"]): item for item in _presence().find({"user_id": {"$in": list(user_ids)}})}


def _circle_for_member(circle_id: str, user_id) -> dict:
    object_id = parse_object_id(circle_id)
    circle = _circles().find_one({"_id": object_id, "member_ids": user_id}) if object_id else None
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found.")
    return circle


def _friendship_with(first, second, *, accepted: bool = False) -> dict | None:
    query = {"pair_key": _pair_key(first, second)}
    if accepted:
        query["status"] = "accepted"
    return _friendships().find_one(query)


def _online_friend_count(user_id) -> int:
    relationships = _friendships().find({"status": "accepted", "$or": [{"requester_id": user_id}, {"recipient_id": user_id}]})
    friend_ids = [
        item["recipient_id"] if item.get("requester_id") == user_id else item["requester_id"]
        for item in relationships
    ]
    if not friend_ids:
        return 0
    cutoff = utc_now() - timedelta(seconds=PRESENCE_FRESH_SECONDS)
    return len(list(_presence().find({"user_id": {"$in": friend_ids}, "visibility": "online", "last_seen_at": {"$gte": cutoff}})))


def _serialize_circle(circle: dict, viewer_id, users: dict | None = None, presence: dict | None = None) -> dict:
    member_ids = set(circle.get("member_ids") or [])
    users = users or _user_map(member_ids)
    presence = presence or _presence_map(member_ids)
    members = [
        _public_person(users[str(member_id)], presence=presence.get(str(member_id)))
        for member_id in circle.get("member_ids") or []
        if str(member_id) in users
    ]
    names = {item["id"]: item["name"] for item in members}
    messages = [
        {
            "id": item.get("id"),
            "senderId": str(item.get("sender_id")),
            "senderName": names.get(str(item.get("sender_id")), "Circle member"),
            "message": item.get("message", ""),
            "createdAt": to_iso(item.get("created_at")),
            "mine": item.get("sender_id") == viewer_id,
        }
        for item in (circle.get("messages") or [])[-200:]
    ]
    activity = circle.get("activity")
    if activity:
        activity = {
            "id": activity.get("id"),
            "type": activity.get("type"),
            "prompt": activity.get("prompt"),
            "createdAt": to_iso(activity.get("created_at")),
            "responses": [
                {"memberId": member_id, "memberName": names.get(member_id, "Circle member"), "response": response}
                for member_id, response in (activity.get("responses") or {}).items()
            ],
        }
    return {
        "id": str(circle["_id"]),
        "name": circle.get("name", "Together circle"),
        "kind": circle.get("kind", "group"),
        "ownerId": str(circle.get("owner_id")),
        "isOwner": circle.get("owner_id") == viewer_id,
        "members": members,
        "messages": messages,
        "activity": activity,
        "createdAt": to_iso(circle.get("created_at")),
        "updatedAt": to_iso(circle.get("updated_at")),
    }


@router.get("")
def together_state(current_user: dict = Depends(get_current_user)) -> dict:
    user_id = current_user["_id"]
    relationships = list(_friendships().find({"$or": [{"requester_id": user_id}, {"recipient_id": user_id}]}))
    related_ids = {
        item["recipient_id"] if item.get("requester_id") == user_id else item["requester_id"]
        for item in relationships
        if item.get("status") != "blocked"
    }
    users = _user_map(related_ids)
    presence = _presence_map(related_ids)
    friends = []
    incoming = []
    outgoing = []
    for item in relationships:
        other_id = item.get("recipient_id") if item.get("requester_id") == user_id else item.get("requester_id")
        other = users.get(str(other_id))
        if not other or item.get("status") == "blocked":
            continue
        person = _public_person(other, presence=presence.get(str(other_id)))
        person["requestId"] = str(item["_id"])
        if item.get("status") == "accepted":
            friends.append(person)
        elif item.get("recipient_id") == user_id:
            incoming.append(person)
        else:
            outgoing.append(person)
    circles = list(_circles().find({"member_ids": user_id}).sort("updated_at", -1).limit(50))
    return {
        "friends": sorted(friends, key=lambda item: (item["presence"] == "offline", item["name"].lower())),
        "incomingRequests": incoming,
        "outgoingRequests": outgoing,
        "circles": [_serialize_circle(item, user_id) for item in circles],
        "presence": (_presence().find_one({"user_id": user_id}) or {}).get("visibility", "online"),
        "privacy": "Only accepted friends can see your availability and invite you into circles.",
    }


@router.post("/presence", dependencies=[Depends(rate_limit(30, 300, "together-presence"))])
def update_presence(payload: PresenceUpdate, current_user: dict = Depends(get_current_user)) -> dict:
    now = utc_now()
    _presence().update_one(
        {"user_id": current_user["_id"]},
        {"$set": {"visibility": payload.visibility, "last_seen_at": now, "expires_at": now + timedelta(seconds=PRESENCE_TTL_SECONDS)}},
        upsert=True,
    )
    return {"presence": payload.visibility, "onlineFriends": _online_friend_count(current_user["_id"]), "updatedAt": to_iso(now)}


@router.post("/friends/requests", status_code=201, dependencies=[Depends(rate_limit(12, 3600, "friend-request"))])
def create_friend_request(payload: FriendRequestCreate, current_user: dict = Depends(get_current_user)) -> dict:
    email = str(payload.email).strip().lower()
    if email == str(current_user.get("email", "")).strip().lower():
        raise HTTPException(status_code=400, detail="Use another person's Emora account email.")
    recipient = users_collection().find_one({"email": email})
    if not recipient:
        return {"message": "If that person has an Emora account, the request will appear privately."}
    pair_key = _pair_key(current_user["_id"], recipient["_id"])
    existing = _friendships().find_one({"pair_key": pair_key})
    if existing and existing.get("status") == "accepted":
        raise HTTPException(status_code=409, detail="You are already friends.")
    if existing and existing.get("status") == "blocked":
        raise HTTPException(status_code=403, detail="This connection is unavailable.")
    if existing and existing.get("status") == "pending":
        raise HTTPException(status_code=409, detail="A friend request is already waiting.")
    now = utc_now()
    document = {
        "pair_key": pair_key,
        "requester_id": current_user["_id"],
        "recipient_id": recipient["_id"],
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }
    try:
        document["_id"] = _friendships().insert_one(document).inserted_id
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="A connection already exists.") from exc
    create_notification(
        recipient["_id"],
        category="together",
        title="A friend wants to connect",
        message=f"{current_user.get('name') or 'Someone'} sent you a private friend request.",
        action_path="/together",
        action_label="Review request",
        dedupe_key=f"friend-request:{document['_id']}",
    )
    return {"message": "Friend request sent privately.", "requestId": str(document["_id"])}


@router.post("/friends/requests/{request_id}/respond")
def respond_to_friend_request(request_id: str, payload: FriendRequestResponse, current_user: dict = Depends(get_current_user)) -> dict:
    object_id = parse_object_id(request_id)
    relationship = _friendships().find_one({"_id": object_id, "recipient_id": current_user["_id"], "status": "pending"}) if object_id else None
    if not relationship:
        raise HTTPException(status_code=404, detail="Friend request not found.")
    if payload.response == "decline":
        _friendships().delete_one({"_id": relationship["_id"], "recipient_id": current_user["_id"]})
        return {"message": "Friend request declined."}
    now = utc_now()
    relationship = _friendships().find_one_and_update(
        {"_id": relationship["_id"], "recipient_id": current_user["_id"], "status": "pending"},
        {"$set": {"status": "accepted", "accepted_at": now, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    create_notification(
        relationship["requester_id"],
        category="together",
        title="Friend request accepted",
        message=f"{current_user.get('name') or 'Your friend'} can now see you in Together when you choose to be visible.",
        action_path="/together",
        action_label="Open Together",
        dedupe_key=f"friend-accepted:{relationship['_id']}",
        celebration=True,
    )
    return {"message": "You are now connected."}


@router.delete("/friends/{friend_id}")
def remove_friend(friend_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    friend_object_id = parse_object_id(friend_id)
    if not friend_object_id:
        raise HTTPException(status_code=404, detail="Friend not found.")
    relationship = _friendship_with(current_user["_id"], friend_object_id, accepted=True)
    if not relationship:
        raise HTTPException(status_code=404, detail="Friend not found.")
    _friendships().delete_one({"_id": relationship["_id"]})
    return {"message": "Friend removed. Your private history was not shared."}


@router.post("/friends/{friend_id}/block")
def block_friend(friend_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    friend_object_id = parse_object_id(friend_id)
    if not friend_object_id or not users_collection().find_one({"_id": friend_object_id}):
        raise HTTPException(status_code=404, detail="Account not found.")
    now = utc_now()
    _friendships().update_one(
        {"pair_key": _pair_key(current_user["_id"], friend_object_id)},
        {"$set": {"requester_id": current_user["_id"], "recipient_id": friend_object_id, "status": "blocked", "blocked_by": current_user["_id"], "updated_at": now}, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    _circles().update_many(
        {"owner_id": current_user["_id"], "member_ids": friend_object_id},
        {"$pull": {"member_ids": friend_object_id}, "$set": {"updated_at": now}},
    )
    _circles().update_many(
        {"owner_id": {"$ne": current_user["_id"]}, "member_ids": {"$all": [current_user["_id"], friend_object_id]}},
        {"$pull": {"member_ids": current_user["_id"]}, "$set": {"updated_at": now}},
    )
    return {"message": "Account blocked. They cannot see your presence or invite you."}


@router.post("/circles", status_code=201, dependencies=[Depends(rate_limit(12, 3600, "circle-create"))])
def create_circle(payload: CircleCreate, current_user: dict = Depends(get_current_user)) -> dict:
    member_ids = []
    for value in payload.member_ids:
        object_id = parse_object_id(value)
        if object_id and object_id != current_user["_id"] and object_id not in member_ids:
            member_ids.append(object_id)
    required = 1 if payload.kind in {"duo", "couple"} else None
    if required and len(member_ids) != required:
        raise HTTPException(status_code=400, detail=f"A {payload.kind} circle needs exactly one friend.")
    if not member_ids or len(member_ids) + 1 > MAX_CIRCLE_MEMBERS:
        raise HTTPException(status_code=400, detail="Choose between 1 and 7 accepted friends.")
    if any(not _friendship_with(current_user["_id"], member_id, accepted=True) for member_id in member_ids):
        raise HTTPException(status_code=403, detail="Every circle member must first be an accepted friend.")
    now = utc_now()
    document = {
        "name": " ".join(payload.name.split()),
        "kind": payload.kind,
        "owner_id": current_user["_id"],
        "member_ids": [current_user["_id"], *member_ids],
        "messages": [],
        "activity": None,
        "created_at": now,
        "updated_at": now,
    }
    document["_id"] = _circles().insert_one(document).inserted_id
    for member_id in member_ids:
        create_notification(
            member_id,
            category="together",
            title=f"You were added to {document['name']}",
            message=f"{current_user.get('name') or 'A friend'} created a private {payload.kind} circle with you.",
            action_path=f"/together?circle={document['_id']}",
            action_label="Enter circle",
            dedupe_key=f"circle:{document['_id']}:{member_id}",
        )
    return {"circle": _serialize_circle(document, current_user["_id"])}


@router.get("/circles/{circle_id}")
def get_circle(circle_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    return {"circle": _serialize_circle(_circle_for_member(circle_id, current_user["_id"]), current_user["_id"])}


@router.post("/circles/{circle_id}/members")
def add_circle_member(circle_id: str, payload: CircleMemberAdd, current_user: dict = Depends(get_current_user)) -> dict:
    circle = _circle_for_member(circle_id, current_user["_id"])
    if circle.get("owner_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only the circle owner can add friends.")
    member_id = parse_object_id(payload.member_id)
    if not member_id or not _friendship_with(current_user["_id"], member_id, accepted=True):
        raise HTTPException(status_code=403, detail="Choose an accepted friend.")
    if circle.get("kind") in {"duo", "couple"} or len(circle.get("member_ids") or []) >= MAX_CIRCLE_MEMBERS:
        raise HTTPException(status_code=409, detail="This circle cannot add another member.")
    circle = _circles().find_one_and_update(
        {"_id": circle["_id"], "owner_id": current_user["_id"]},
        {"$addToSet": {"member_ids": member_id}, "$set": {"updated_at": utc_now()}},
        return_document=ReturnDocument.AFTER,
    )
    return {"circle": _serialize_circle(circle, current_user["_id"])}


@router.post("/circles/{circle_id}/messages", dependencies=[Depends(rate_limit(60, 300, "circle-message"))])
def send_circle_message(circle_id: str, payload: CircleMessageCreate, current_user: dict = Depends(get_current_user)) -> dict:
    circle = _circle_for_member(circle_id, current_user["_id"])
    now = utc_now()
    message = {"id": uuid4().hex, "sender_id": current_user["_id"], "message": " ".join(payload.message.split()), "created_at": now}
    circle = _circles().find_one_and_update(
        {"_id": circle["_id"], "member_ids": current_user["_id"]},
        {"$push": {"messages": {"$each": [message], "$slice": -200}}, "$set": {"updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    return {"circle": _serialize_circle(circle, current_user["_id"])}


@router.post("/circles/{circle_id}/activities")
def start_circle_activity(circle_id: str, payload: CircleActivityCreate, current_user: dict = Depends(get_current_user)) -> dict:
    circle = _circle_for_member(circle_id, current_user["_id"])
    if payload.activity_type not in ACTIVITY_CATALOG:
        raise HTTPException(status_code=400, detail="Unknown circle activity.")
    now = utc_now()
    activity = {"id": uuid4().hex, "type": payload.activity_type, "prompt": choice(ACTIVITY_CATALOG[payload.activity_type]), "responses": {}, "created_by": current_user["_id"], "created_at": now}
    circle = _circles().find_one_and_update(
        {"_id": circle["_id"], "member_ids": current_user["_id"]},
        {"$set": {"activity": activity, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    return {"circle": _serialize_circle(circle, current_user["_id"])}


@router.post("/circles/{circle_id}/activities/{activity_id}/responses")
def respond_to_circle_activity(circle_id: str, activity_id: str, payload: CircleActivityResponse, current_user: dict = Depends(get_current_user)) -> dict:
    circle = _circle_for_member(circle_id, current_user["_id"])
    if (circle.get("activity") or {}).get("id") != activity_id:
        raise HTTPException(status_code=404, detail="Activity is no longer active.")
    circle = _circles().find_one_and_update(
        {"_id": circle["_id"], "member_ids": current_user["_id"], "activity.id": activity_id},
        {"$set": {f"activity.responses.{current_user['_id']}": " ".join(payload.response.split()), "updated_at": utc_now()}},
        return_document=ReturnDocument.AFTER,
    )
    return {"circle": _serialize_circle(circle, current_user["_id"])}


@router.delete("/circles/{circle_id}")
def leave_or_delete_circle(circle_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    circle = _circle_for_member(circle_id, current_user["_id"])
    if circle.get("owner_id") == current_user["_id"]:
        _circles().delete_one({"_id": circle["_id"], "owner_id": current_user["_id"]})
        return {"message": "Circle deleted for every member.", "deleted": True}
    _circles().update_one({"_id": circle["_id"]}, {"$pull": {"member_ids": current_user["_id"]}, "$set": {"updated_at": utc_now()}})
    return {"message": "You left the circle.", "deleted": False}
