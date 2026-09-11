from __future__ import annotations

from datetime import timedelta

from app.config import settings
from app.database import feature_collection, utc_now
from app.notifications import create_notification


def record_security_event(user_id, kind: str, label: str) -> None:
    now = utc_now()
    feature_collection("security_events").insert_one(
        {
            "user_id": user_id,
            "kind": kind,
            "label": label,
            "created_at": now,
            "delete_at": now + timedelta(days=settings.security_event_retention_days),
        }
    )
    create_notification(
        user_id,
        category="security",
        title="Account security activity",
        message=label,
        action_path="/profile#profile-security",
        action_label="Review activity",
        importance="high",
    )
