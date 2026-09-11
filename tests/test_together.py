from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace

from bson import ObjectId
from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.migrations import MIGRATIONS
from app.routers import together


def _value(document, key):
    value = document
    for part in key.split("."):
        value = value.get(part) if isinstance(value, dict) else None
    return value


def _matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(document, item) for item in expected):
                return False
            continue
        actual = _value(document, key)
        if isinstance(expected, dict):
            if "$in" in expected and not (actual in expected["$in"] or isinstance(actual, list) and any(item in expected["$in"] for item in actual)):
                return False
            if "$all" in expected and not isinstance(actual, list) or "$all" in expected and not all(item in actual for item in expected["$all"]):
                return False
            if "$ne" in expected and actual == expected["$ne"]:
                return False
        elif isinstance(actual, list):
            if expected not in actual:
                return False
        elif actual != expected:
            return False
    return True


class Cursor(list):
    def sort(self, key, direction):
        super().sort(key=lambda item: _value(item, key) or "", reverse=direction < 0)
        return self

    def limit(self, amount):
        return Cursor(self[:amount])


class Collection:
    def __init__(self, documents=()):
        self.documents = [deepcopy(item) for item in documents]

    def find(self, query, *args, **kwargs):
        return Cursor([deepcopy(item) for item in self.documents if _matches(item, query)])

    def find_one(self, query):
        return next((deepcopy(item) for item in self.documents if _matches(item, query)), None)

    def insert_one(self, document):
        stored = deepcopy(document)
        stored.setdefault("_id", ObjectId())
        self.documents.append(stored)
        return SimpleNamespace(inserted_id=stored["_id"])

    def delete_one(self, query):
        for index, item in enumerate(self.documents):
            if _matches(item, query):
                self.documents.pop(index)
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    def update_one(self, query, update, upsert=False):
        item = next((item for item in self.documents if _matches(item, query)), None)
        if item is None and upsert:
            item = {key: value for key, value in query.items() if not key.startswith("$") and not isinstance(value, dict)}
            item["_id"] = ObjectId()
            self.documents.append(item)
            for key, value in update.get("$setOnInsert", {}).items():
                item[key] = deepcopy(value)
        if item is not None:
            self._apply(item, update)
        return SimpleNamespace(modified_count=int(item is not None))

    def update_many(self, query, update):
        matched = 0
        for item in self.documents:
            if _matches(item, query):
                self._apply(item, update)
                matched += 1
        return SimpleNamespace(modified_count=matched)

    def find_one_and_update(self, query, update, return_document=None):
        item = next((item for item in self.documents if _matches(item, query)), None)
        if item is None:
            return None
        self._apply(item, update)
        return deepcopy(item)

    @staticmethod
    def _apply(item, update):
        for key, value in update.get("$set", {}).items():
            target = item
            parts = key.split(".")
            for part in parts[:-1]:
                target = target.setdefault(part, {})
            target[parts[-1]] = deepcopy(value)
        for key, value in update.get("$addToSet", {}).items():
            if value not in item.setdefault(key, []):
                item[key].append(deepcopy(value))
        for key, value in update.get("$pull", {}).items():
            item[key] = [entry for entry in item.get(key, []) if entry != value]
        for key, spec in update.get("$push", {}).items():
            values = deepcopy(spec.get("$each", [spec])) if isinstance(spec, dict) else [deepcopy(spec)]
            item.setdefault(key, []).extend(values)
            if isinstance(spec, dict) and spec.get("$slice") is not None:
                item[key] = item[key][spec["$slice"] :]


@pytest.fixture
def social_store(monkeypatch):
    owner = {"_id": ObjectId(), "name": "Mahesh", "email": "mahesh@example.com"}
    friend = {"_id": ObjectId(), "name": "Asha", "email": "asha@example.com"}
    stranger = {"_id": ObjectId(), "name": "Noor", "email": "noor@example.com"}
    collections = {"friendships": Collection(), "social_presence": Collection(), "social_circles": Collection(), "notifications": Collection()}
    users = Collection([owner, friend, stranger])
    notifications = []
    monkeypatch.setattr(together, "feature_collection", lambda name: collections[name])
    monkeypatch.setattr(together, "users_collection", lambda: users)
    monkeypatch.setattr(together, "create_notification", lambda user_id, **kwargs: notifications.append({"user_id": user_id, **kwargs}))
    return SimpleNamespace(owner=owner, friend=friend, stranger=stranger, collections=collections, notifications=notifications)


def test_together_page_is_a_normal_workspace_route_and_locked_pages_are_untouched():
    client = TestClient(app)
    page = client.get("/together").text
    assert client.get("/together").status_code == 200
    assert 'id="together-friend-form"' in page
    assert 'id="together-circle-room"' in page
    assert "together.js?v=20260901-together-v1" in page
    assert 'href="/together"' in page
    for path in ("/play", "/your-emora"):
        locked = client.get(path).text
        assert "together.css" not in locked
        assert "together.js" not in locked


def test_friend_request_requires_consent_and_acceptance_enables_connection(social_store):
    result = together.create_friend_request(together.FriendRequestCreate(email="asha@example.com"), social_store.owner)
    relationship = social_store.collections["friendships"].documents[0]
    assert result["message"] == "Friend request sent privately."
    assert relationship["status"] == "pending"
    assert relationship["recipient_id"] == social_store.friend["_id"]
    assert social_store.notifications[0]["user_id"] == social_store.friend["_id"]

    accepted = together.respond_to_friend_request(
        str(relationship["_id"]), together.FriendRequestResponse(response="accept"), social_store.friend
    )
    assert accepted["message"] == "You are now connected."
    assert social_store.collections["friendships"].documents[0]["status"] == "accepted"


def test_missing_email_does_not_reveal_whether_an_account_exists(social_store):
    result = together.create_friend_request(together.FriendRequestCreate(email="missing@example.com"), social_store.owner)
    assert "If that person has an Emora account" in result["message"]
    assert social_store.collections["friendships"].documents == []


def test_presence_can_be_hidden_and_is_not_exposed_as_online(social_store):
    together.update_presence(together.PresenceUpdate(visibility="hidden"), social_store.owner)
    presence = social_store.collections["social_presence"].documents[0]
    person = together._public_person(social_store.owner, presence=presence)
    assert person["presence"] == "offline"
    assert person["lastSeenAt"] is None


def test_circle_requires_accepted_friends_and_supports_chat_and_activity(social_store):
    with pytest.raises(HTTPException) as exc_info:
        together.create_circle(
            together.CircleCreate(name="Us", kind="duo", memberIds=[str(social_store.friend["_id"])]), social_store.owner
        )
    assert exc_info.value.status_code == 403

    social_store.collections["friendships"].insert_one({
        "pair_key": together._pair_key(social_store.owner["_id"], social_store.friend["_id"]),
        "requester_id": social_store.owner["_id"], "recipient_id": social_store.friend["_id"], "status": "accepted",
    })
    result = together.create_circle(
        together.CircleCreate(name="Our corner", kind="couple", memberIds=[str(social_store.friend["_id"])]), social_store.owner
    )
    circle_id = result["circle"]["id"]
    assert result["circle"]["kind"] == "couple"
    assert len(result["circle"]["members"]) == 2

    chat = together.send_circle_message(circle_id, together.CircleMessageCreate(message="  Movie tonight?  "), social_store.friend)
    assert chat["circle"]["messages"][0]["message"] == "Movie tonight?"
    assert chat["circle"]["messages"][0]["mine"] is True

    activity = together.start_circle_activity(circle_id, together.CircleActivityCreate(activityType="question"), social_store.owner)
    activity_id = activity["circle"]["activity"]["id"]
    response = together.respond_to_circle_activity(
        circle_id, activity_id, together.CircleActivityResponse(response="A shared trip"), social_store.friend
    )
    assert response["circle"]["activity"]["responses"][0]["response"] == "A shared trip"


def test_together_has_a_numbered_database_migration():
    assert any(version == 3 and name == "together-friends-presence-and-circles" for version, name, _ in MIGRATIONS)
