from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta

from app.config import settings
from app.database import ensure_indexes, ensure_together_indexes, get_database, utc_now


Migration = tuple[int, str, Callable[[], None]]


def _backfill_retention_deadlines() -> None:
    database = get_database()
    now = utc_now()
    database["auth_sessions"].update_many(
        {"expires_at": {"$exists": False}},
        {"$set": {"expires_at": now + timedelta(days=settings.auth_session_retention_days)}},
    )
    database["security_events"].update_many(
        {"delete_at": {"$exists": False}},
        {"$set": {"delete_at": now + timedelta(days=settings.security_event_retention_days)}},
    )
    database["billing_requests"].update_many(
        {"delete_at": {"$exists": False}},
        {"$set": {"delete_at": now + timedelta(days=settings.billing_request_retention_days)}},
    )


MIGRATIONS: tuple[Migration, ...] = (
    (1, "baseline-and-retention-indexes", ensure_indexes),
    (2, "backfill-retention-deadlines", _backfill_retention_deadlines),
    (3, "together-friends-presence-and-circles", ensure_together_indexes),
)


def run_migrations() -> list[int]:
    """Apply repeatable database migrations and record completed versions."""
    database = get_database()
    collection = database["schema_migrations"]
    collection.create_index("version", unique=True)
    applied = {int(item["version"]) for item in collection.find({}, {"version": 1})}
    completed: list[int] = []
    for version, name, migration in MIGRATIONS:
        if version in applied:
            continue
        migration()
        collection.update_one(
            {"version": version},
            {"$setOnInsert": {"version": version, "name": name, "applied_at": utc_now()}},
            upsert=True,
        )
        completed.append(version)
    return completed
