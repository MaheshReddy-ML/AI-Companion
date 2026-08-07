"""Runs against the disposable MongoDB service in CI; skipped for normal local unit tests."""

import os
from uuid import uuid4

import pytest

from app.database import ensure_indexes, users_collection, utc_now


pytestmark = pytest.mark.skipif(
    os.getenv("MONGO_INTEGRATION_TEST") != "true",
    reason="Set MONGO_INTEGRATION_TEST=true with a disposable MongoDB instance to run integration tests.",
)


def test_mongodb_indexes_and_round_trip_are_available():
    ensure_indexes()
    email = f"ci-{uuid4().hex}@example.test"
    inserted = users_collection().insert_one({"email": email, "created_at": utc_now()})
    try:
        saved = users_collection().find_one({"_id": inserted.inserted_id})
        assert saved is not None
        assert saved["email"] == email
    finally:
        users_collection().delete_one({"_id": inserted.inserted_id})
