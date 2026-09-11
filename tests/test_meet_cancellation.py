"""Opt-in integration tests use an isolated MongoDB database, never user data.
Run: EMORA_TEST_MONGO=1 venv/bin/python -m pytest tests/test_meet_cancellation.py -q
"""
import os
from uuid import uuid4

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app.database import get_client
from app.routers import api_chat


@pytest.fixture
def turns(monkeypatch):
    if os.environ.get("EMORA_TEST_MONGO") != "1":
        pytest.skip("Set EMORA_TEST_MONGO=1 for isolated MongoDB cancellation tests")
    client = get_client()
    name = "emora_meet_test_" + uuid4().hex
    db = client[name]
    collection = db.turns
    collection.create_index([("user_id", 1), ("client_turn_id", 1)], unique=True)
    monkeypatch.setattr(api_chat, "feature_collection", lambda _: collection)
    monkeypatch.setattr(api_chat, "conversations_collection", lambda: db.conversations)
    try:
        yield collection
    finally:
        client.drop_database(name)


def test_cancel_before_claim_cannot_start_generation(turns):
    user = {"_id": ObjectId()}
    result = api_chat.cancel_chat_turn("turn-before-claim", user)
    assert result["cancelRequested"]
    with pytest.raises(HTTPException) as error:
        api_chat._claim_chat_turn(user["_id"], "turn-before-claim")
    assert error.value.status_code == 409
    assert turns.find_one()["status"] == "cancel_requested"


def test_cancelled_expired_lease_is_not_reclaimed(turns):
    user = {"_id": ObjectId()}
    _, claimed = api_chat._claim_chat_turn(user["_id"], "turn-during-work")
    assert claimed
    assert api_chat.cancel_chat_turn("turn-during-work", user)["cancelRequested"]
    with pytest.raises(HTTPException):
        api_chat._claim_chat_turn(user["_id"], "turn-during-work")


def test_cancel_is_user_scoped_and_preserves_completed_turn(turns):
    user = {"_id": ObjectId()}
    doc, _ = api_chat._claim_chat_turn(user["_id"], "turn-finished-work")
    turns.update_one({"_id": doc["_id"]}, {"$set": {"status": "completed"}})
    assert not api_chat.cancel_chat_turn("turn-finished-work", user)["cancelRequested"]
    assert api_chat.cancel_chat_turn("turn-finished-work", {"_id": ObjectId()})["cancelRequested"]
    assert turns.find_one({"_id": doc["_id"]})["status"] == "completed"
