import asyncio
from bson import ObjectId
from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest
from types import SimpleNamespace

from app.access import access_profile, entitlements_for_plan, has_entitlement, is_platform_admin, usage_limits_for_user
from app.database import serialize_user
from app.main import app
from app.routers import api_chat, billing, companion, personal, play
from app.security import require_entitlement


def test_owner_email_allowlist_receives_admin_and_complete_access():
    for email in ("hemu171807@gmail.com", "emoracomapnion@gmail.com"):
        user = {"_id": ObjectId(), "email": email.upper(), "name": "Owner"}
        access = access_profile(user)

        assert is_platform_admin(user)
        assert access["plan"] == "admin"
        assert access["isAdmin"] is True
        assert "admin_console" in access["entitlements"]
        assert has_entitlement(user, "voice_postcards")


def test_plan_entitlements_are_cumulative_and_require_active_status():
    free_user = {"email": "free@example.com"}
    pro_user = {"email": "pro@example.com", "subscription": {"plan": "pro", "status": "active"}}
    inactive_user = {"email": "past@example.com", "subscription": {"plan": "complete", "status": "canceled"}}

    assert "text_chat" in entitlements_for_plan("free")
    assert has_entitlement(pro_user, "voice")
    assert has_entitlement(pro_user, "conversation_remix")
    assert not has_entitlement(pro_user, "voice_postcards")
    assert access_profile(inactive_user)["plan"] == "free"
    assert not has_entitlement(free_user, "voice")
    assert usage_limits_for_user(free_user)["chatMessageCharacters"] == 2_000
    assert usage_limits_for_user(pro_user)["ttsConcurrentRequests"] == 2
    assert has_entitlement(pro_user, "adaptive_companion")
    assert has_entitlement(pro_user, "deep_conversation")
    assert has_entitlement(pro_user, "session_reflection")
    assert not has_entitlement(inactive_user, "adaptive_companion")


def test_deep_conversation_is_enforced_by_the_server():
    with pytest.raises(HTTPException) as exc_info:
        api_chat.require_mode_access({"email": "free@example.com"}, "deep")
    assert exc_info.value.status_code == 403
    api_chat.require_mode_access({"email": "pro@example.com", "subscription": {"plan": "pro", "status": "active"}}, "deep")


def test_daily_arrival_uses_refined_moods_and_returns_emora_response(monkeypatch):
    owner_id = ObjectId()
    stored = {}

    class CheckIns:
        def update_one(self, query, update, upsert=False):
            stored["_id"] = ObjectId()
            stored.update(query)
            stored.update(update["$setOnInsert"])
            stored.update(update["$set"])

        def find_one(self, query):
            return dict(stored)

    monkeypatch.setattr(personal, "feature_collection", lambda _: CheckIns())
    result = personal.save_check_in(personal.ArrivalRequest(mood="heavy"), {"_id": owner_id})
    assert result["checkIn"]["mood"] == "heavy"
    assert "carry" in result["companionResponse"]


def test_entitlement_dependency_rejects_a_plan_without_access():
    dependency = require_entitlement("focus_rooms")

    with pytest.raises(HTTPException) as exc_info:
        dependency({"email": "free@example.com"})

    assert exc_info.value.status_code == 403
    assert "focus rooms" in str(exc_info.value.detail)


def test_focus_room_response_exposes_only_shared_room_state(monkeypatch):
    inserted = {}
    presence = []

    class FocusRooms:
        def insert_one(self, document):
            inserted.update(document)
            return SimpleNamespace(inserted_id=ObjectId())

    class Presence:
        def update_one(self, query, update, upsert=False):
            presence.append({**query, **update["$set"], **update["$setOnInsert"]})

        def find(self, query, sort=None):
            return presence

    rooms = FocusRooms()
    monkeypatch.setattr(play, "feature_collection", lambda name: Presence() if name == "focus_room_presence" else rooms)
    owner_id = ObjectId()
    response = play.create_focus_room(
        play.RoomRequest(name=" Quiet focus ", minutes=25, connection_id="connection-owner"),
        {"_id": owner_id, "name": "Mahesh"},
    )

    assert response["room"]["status"] == "ACTIVE"
    assert response["room"]["name"] == "Quiet focus"
    assert response["room"]["members"] == 1
    assert response["room"]["participants"] == [{"name": "Mahesh", "mine": True}]
    assert response["room"]["isHost"] is True
    assert inserted["owner_id"] == owner_id
    assert "owner_id" not in response["room"]
    assert "memberIds" not in response["room"]


def test_current_focus_room_restores_membership_without_exposing_identities(monkeypatch):
    owner_id = ObjectId()
    other_id = ObjectId()
    now = play.utc_now()
    room = {
        "_id": ObjectId(),
        "code": "QUIET1",
        "name": "Ship together",
        "minutes": 25,
        "members": [owner_id, other_id],
        "ends_at": now + play.timedelta(minutes=20),
        "last_activity_at": now,
        "messages": [
            {"id": "one", "role": "user", "content": "I finished the outline.", "author_id": other_id, "created_at": now},
            {"id": "two", "role": "assistant", "content": "What is the next shared step?", "created_at": now},
        ],
    }

    class FocusRooms:
        def find(self, query, sort=None):
            return []

        def find_one(self, query, sort=None):
            assert query["members"] == owner_id
            assert sort == [("last_activity_at", -1)]
            return dict(room)

    class Presence:
        def find(self, query, sort=None):
            return [
                {"user_id": owner_id, "display_name": "Mahesh", "joined_at": now},
                {"user_id": other_id, "display_name": "Rahul", "joined_at": now},
            ]

    rooms = FocusRooms()
    monkeypatch.setattr(play, "feature_collection", lambda name: Presence() if name == "focus_room_presence" else rooms)
    response = play.current_focus_room({"_id": owner_id})

    assert response["room"]["code"] == "QUIET1"
    assert response["room"]["members"] == 2
    assert response["room"]["messages"][0]["sender"] == "Member"
    assert response["room"]["messages"][0]["mine"] is False
    assert response["room"]["messages"][1]["sender"] == "Emora"
    assert [item["name"] for item in response["room"]["participants"]] == ["Mahesh", "Rahul"]
    assert "owner_id" not in response["room"]
    assert all("author_id" not in message for message in response["room"]["messages"])


def test_shared_focus_chat_saves_member_and_emora_messages_atomically(monkeypatch):
    member_id = ObjectId()
    room = {
        "_id": ObjectId(),
        "code": "TEAM25",
        "name": "Finish the demo",
        "minutes": 25,
        "members": [member_id, ObjectId()],
        "messages": [],
        "message_count": 0,
        "reply_in_progress": False,
        "ends_at": play.utc_now() + play.timedelta(minutes=20),
        "last_activity_at": play.utc_now(),
    }

    class FocusRooms:
        def find(self, query, sort=None):
            return []

        def find_one_and_update(self, query, update, return_document=False):
            for message in update.get("$push", {}).values():
                room.setdefault("messages", []).append(message)
            for key, amount in update.get("$inc", {}).items():
                room[key] = room.get(key, 0) + amount
            room.update(update.get("$set", {}))
            for key in update.get("$unset", {}):
                room.pop(key, None)
            return dict(room)

        def find_one(self, query, sort=None):
            return dict(room)

        def update_one(self, query, update):
            room.update(update.get("$set", {}))
            return SimpleNamespace(modified_count=1)

        def delete_one(self, query):
            raise AssertionError("An active room must not be deleted")

    async def fake_reply(**kwargs):
        assert kwargs["requester_id"] == "focus-room:TEAM25"
        assert "temporary shared Focus Together room" in kwargs["persona_prompt"]
        return "Choose one owner for the final slide, then regroup.", {}, "test-model"

    class Presence:
        def find(self, query, sort=None):
            return [{"user_id": member_id, "display_name": "Mahesh", "joined_at": play.utc_now()}]

    rooms = FocusRooms()
    monkeypatch.setattr(play, "feature_collection", lambda name: Presence() if name == "focus_room_presence" else rooms)
    monkeypatch.setattr(play, "get_companion_reply", fake_reply)
    user = {"_id": member_id, "name": "Mahesh", "email": "pro@example.com", "subscription": {"plan": "pro", "status": "active"}}
    response = asyncio.run(play.send_focus_room_message("team25", play.FocusMessageRequest(message="@emora How do we finish?"), user))

    assert [message["role"] for message in response["room"]["messages"]] == ["user", "assistant"]
    assert response["room"]["messages"][0]["sender"] == "You"
    assert response["room"]["messages"][1]["sender"] == "Emora"
    assert response["room"]["replyPending"] is False
    assert room["message_count"] == 2


def test_regular_focus_message_is_shared_without_invoking_emora(monkeypatch):
    member_id = ObjectId()
    room = {
        "_id": ObjectId(), "code": "TALK25", "name": "Talk together", "minutes": 25,
        "owner_id": member_id, "members": [member_id], "messages": [], "message_count": 0,
        "status": "ACTIVE", "revision": 1, "reply_in_progress": False,
        "created_at": play.utc_now(), "ends_at": play.utc_now() + play.timedelta(minutes=20),
    }

    class FocusRooms:
        def find(self, query, sort=None):
            return []

        def find_one_and_update(self, query, update, return_document=False):
            room["messages"].append(update["$push"]["messages"])
            room["message_count"] += update["$inc"]["message_count"]
            room["revision"] += update["$inc"]["revision"]
            room.update(update["$set"])
            return dict(room)

        def find_one(self, query, sort=None):
            return dict(room)

    class Presence:
        def find(self, query, sort=None):
            return [{"user_id": member_id, "display_name": "Mahesh", "joined_at": play.utc_now()}]

    async def unexpected_reply(**kwargs):
        raise AssertionError("A normal room message must not invoke Emora")

    rooms = FocusRooms()
    monkeypatch.setattr(play, "feature_collection", lambda name: Presence() if name == "focus_room_presence" else rooms)
    monkeypatch.setattr(play, "get_companion_reply", unexpected_reply)
    user = {"_id": member_id, "name": "Mahesh", "email": "pro@example.com", "subscription": {"plan": "pro", "status": "active"}}

    response = asyncio.run(play.send_focus_room_message("talk25", play.FocusMessageRequest(message="Hello everyone"), user))

    assert len(response["room"]["messages"]) == 1
    assert response["room"]["messages"][0]["senderType"] == "USER"
    assert room["reply_in_progress"] is False


def test_focus_reflection_uses_real_room_transcript_and_is_saved_before_cleanup(monkeypatch):
    member_id = ObjectId()
    now = play.utc_now()
    room = {
        "_id": ObjectId(), "code": "REFL25", "name": "Finish the launch note", "minutes": 25,
        "owner_id": member_id, "members": [member_id], "status": "ACTIVE", "revision": 2,
        "created_at": now - play.timedelta(minutes=12), "ends_at": now + play.timedelta(minutes=13),
        "messages": [{"id": "m1", "role": "user", "sender_type": "USER", "sender_name": "Mahesh", "author_id": member_id, "content": "The outline is done; the examples still need work.", "created_at": now}],
    }

    class Rooms:
        def find(self, query, sort=None):
            return []

        def find_one(self, query, sort=None):
            return dict(room)

        def find_one_and_update(self, query, update, return_document=False):
            room.update(update.get("$set", {}))
            room["revision"] += update.get("$inc", {}).get("revision", 0)
            return dict(room)

    class Presence:
        def find(self, query, sort=None):
            return [{"user_id": member_id, "display_name": "Mahesh", "joined_at": now, "last_seen_at": now}]

    async def fake_reply(**kwargs):
        assert "outline is done" in kwargs["history"][0]["content"]
        assert "12 minutes" in kwargs["companion_context"]
        return "The outline moved forward; the examples remain. Choose one example to finish next.", {}, "test-model"

    monkeypatch.setattr(play, "feature_collection", lambda name: Presence() if name == "focus_room_presence" else Rooms())
    monkeypatch.setattr(play, "get_companion_reply", fake_reply)
    user = {"_id": member_id, "name": "Mahesh", "email": "pro@example.com", "subscription": {"plan": "pro", "status": "active"}}
    result = asyncio.run(play.reflect_on_focus_room("refl25", user))

    assert result["reflection"]["elapsedMinutes"] == 12
    assert result["room"]["reflection"]["text"].startswith("The outline moved")


def test_unlimited_focus_room_has_no_deadline(monkeypatch):
    inserted = {}

    class FocusRooms:
        def insert_one(self, document):
            inserted.update(document)
            return SimpleNamespace(inserted_id=ObjectId())

    class Presence:
        def update_one(self, query, update, upsert=False):
            return SimpleNamespace(modified_count=1)

        def find(self, query, sort=None):
            return []

    rooms = FocusRooms()
    monkeypatch.setattr(play, "feature_collection", lambda name: Presence() if name == "focus_room_presence" else rooms)
    response = play.create_focus_room(
        play.RoomRequest(name="Open room", unlimited=True, connection_id="unlimited-owner"),
        {"_id": ObjectId(), "name": "Host"},
    )

    assert inserted["ends_at"] is None
    assert inserted["status"] == "ACTIVE"
    assert response["room"]["unlimited"] is True
    assert response["room"]["endsAt"] is None


def test_only_host_can_end_focus_room(monkeypatch):
    owner_id = ObjectId()
    member_id = ObjectId()
    room = {
        "_id": ObjectId(), "code": "HOST25", "name": "Host room", "owner_id": owner_id,
        "members": [owner_id, member_id], "status": "ACTIVE", "ends_at": None,
    }

    class FocusRooms:
        def find(self, query, sort=None):
            return []

        def find_one(self, query, sort=None):
            return dict(room)

    monkeypatch.setattr(play, "feature_collection", lambda _: FocusRooms())

    with pytest.raises(HTTPException) as exc_info:
        play.end_focus_room("HOST25", {"_id": member_id})

    assert exc_info.value.status_code == 403
    assert room["status"] == "ACTIVE"


def test_focus_room_expiry_transitions_once_and_clears_chat(monkeypatch):
    now = play.utc_now()
    room = {
        "_id": ObjectId(), "code": "ENDED1", "name": "Short room", "minutes": 5,
        "owner_id": ObjectId(), "members": [ObjectId()], "status": "ACTIVE",
        "ends_at": now - play.timedelta(seconds=1), "messages": [{"id": "secret"}],
    }
    updates = []

    class FocusRooms:
        def find(self, query, sort=None):
            return [dict(room)]

        def update_one(self, query, update):
            updates.append(update)
            room.update(update.get("$set", {}))
            return SimpleNamespace(modified_count=1)

        def find_one(self, query, sort=None):
            return None

    class Presence:
        def find(self, query, sort=None):
            return []

    rooms = FocusRooms()
    monkeypatch.setattr(play, "feature_collection", lambda name: Presence() if name == "focus_room_presence" else rooms)
    response = play.current_focus_room({"_id": ObjectId()})

    assert response == {"room": None}
    assert updates[0]["$set"]["status"] == "ENDED"
    assert updates[0]["$set"]["messages"] == []


def test_serialized_session_includes_server_resolved_access():
    payload = serialize_user({"_id": ObjectId(), "name": "Pro User", "email": "pro@example.com", "subscription": {"plan": "pro", "status": "active"}})

    assert payload["access"]["plan"] == "pro"
    assert "ambient_rooms" in payload["access"]["entitlements"]


def test_public_plan_catalog_and_payment_page_expose_all_options():
    client = TestClient(app)
    plans = client.get("/api/billing/plans")

    assert plans.status_code == 200
    assert [plan["id"] for plan in plans.json()["plans"]] == ["free", "plus", "pro", "complete"]
    assert plans.json()["plans"][0]["limits"]["chatMessageCharacters"] == 2_000
    payment = client.get("/payment").text
    for plan in ("free", "plus", "pro", "complete"):
        assert f'data-plan-id="{plan}"' in payment
    assert 'id="billing-admin"' in payment
    assert client.get("/api/billing/access").status_code == 401


def test_owner_email_cannot_be_claimed_through_unverified_registration():
    response = TestClient(app).post(
        "/api/auth/register",
        json={"name": "Not the owner", "email": "hemu171807@gmail.com", "password": "strong-password"},
    )

    assert response.status_code == 403
    assert "Google Sign-In" in response.json()["detail"]


def test_checkout_request_never_persists_payment_credentials(monkeypatch):
    stored = {}

    class Requests:
        def insert_one(self, document):
            stored["request"] = dict(document)
            return SimpleNamespace(inserted_id=ObjectId())

    class Users:
        def update_one(self, query, update):
            stored["user_update"] = update

    monkeypatch.setattr(billing, "feature_collection", lambda _: Requests())
    monkeypatch.setattr(billing, "users_collection", lambda: Users())
    monkeypatch.setattr(billing, "audit_event", lambda *args, **kwargs: None)
    user = {"_id": ObjectId(), "email": "person@example.com"}

    response = billing.request_checkout(
        billing.CheckoutRequest.model_validate({"plan": "pro", "cycle": "yearly", "paymentMethod": "card"}),
        user,
    )

    assert response["request"]["status"] == "pending"
    assert stored["request"]["amount"] == 8630
    assert not ({"cardName", "cardNumber", "cvv", "upiId"} & stored["request"].keys())


def test_adaptive_context_preference_requires_pro_but_can_be_paused_after_downgrade(monkeypatch):
    monkeypatch.setattr(personal, "update_user_preferences", lambda user_id, changes: changes)
    free_user = {"_id": ObjectId(), "email": "free@example.com"}

    with pytest.raises(HTTPException) as exc_info:
        personal.save_preferences(personal.PreferencesRequest(adaptiveContext=True), free_user)

    assert exc_info.value.status_code == 403
    assert personal.save_preferences(personal.PreferencesRequest(adaptiveContext=False), free_user)["preferences"] == {"adaptiveContext": False}


def test_memory_remains_editable_by_its_owner_after_downgrade(monkeypatch):
    owner_id = ObjectId()
    memory_id = ObjectId()
    now = companion.utc_now()
    stored = {
        "_id": memory_id,
        "user_id": owner_id,
        "value": "Old detail",
        "created_at": now,
        "updated_at": now,
    }

    class Memories:
        def find_one_and_update(self, query, update, return_document=False):
            if query.get("_id") != memory_id or query.get("user_id") != owner_id:
                return None
            stored.update(update["$set"])
            return dict(stored)

    monkeypatch.setattr(companion, "memories_collection", lambda: Memories())
    response = companion.update_memory(str(memory_id), companion.ExplicitMemoryRequest(value="Corrected detail"), {"_id": owner_id, "email": "free@example.com"})

    assert response["memory"]["value"] == "Corrected detail"
