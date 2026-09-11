from __future__ import annotations

from datetime import timedelta
import os
from typing import Any

from app.database import feature_collection, to_iso, utc_now


FLAG_DEFINITIONS: dict[str, dict[str, Any]] = {
    "product_events": {"enabled": True, "owner": "product", "reason": "Measure consented journey completion."},
    "goal_onboarding": {"enabled": True, "owner": "product", "reason": "Help new users reach a useful workflow."},
    "public_trust_center": {"enabled": True, "owner": "trust", "reason": "Make product limits and data flow discoverable."},
    "web_grounding": {"enabled": True, "owner": "ai", "reason": "Emergency stop for retrieved web context."},
    "scheduled_delivery": {"enabled": True, "owner": "operations", "reason": "Emergency stop for outbound reminders."},
    "community_writes": {"enabled": True, "owner": "safety", "reason": "Emergency stop for community mutations."},
}

ALLOWED_PRODUCT_EVENTS = {
    "onboarding_started", "onboarding_skipped", "onboarding_completed",
    "first_chat_completed", "first_goal_created", "session_completed",
    "source_saved", "notification_acted_on", "upgrade_viewed",
    "upgrade_completed", "journey_failed",
}
ALLOWED_EVENT_PROPERTIES = {"journey", "route", "plan", "result", "release", "deviceClass"}


def _env_override(name: str) -> bool | None:
    raw = os.getenv(f"FEATURE_{name.upper()}")
    if raw is None:
        return None
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def feature_flags(*, include_internal: bool = False) -> dict[str, Any]:
    try:
        overrides = {
            item["name"]: item
            for item in feature_collection("feature_flags").find({"name": {"$in": list(FLAG_DEFINITIONS)}})
        }
    except Exception:
        # A control-plane lookup must not take the product down. Environment
        # overrides remain available as an emergency fail-closed mechanism.
        overrides = {}
    result: dict[str, Any] = {}
    now = utc_now()
    for name, definition in FLAG_DEFINITIONS.items():
        stored = overrides.get(name, {})
        enabled = bool(stored.get("enabled", definition["enabled"]))
        environment_override = _env_override(name)
        if environment_override is not None:
            enabled = environment_override
        expires_at = stored.get("expires_at")
        if expires_at and expires_at <= now:
            enabled = bool(definition["enabled"])
        if include_internal:
            result[name] = {
                **definition,
                "enabled": enabled,
                "updatedAt": to_iso(stored.get("updated_at")),
                "expiresAt": to_iso(expires_at),
            }
        else:
            result[name] = enabled
    return result


def feature_enabled(name: str) -> bool:
    if name not in FLAG_DEFINITIONS:
        return False
    return bool(feature_flags().get(name, False))


def sanitize_event_properties(properties: dict[str, Any]) -> dict[str, str]:
    clean: dict[str, str] = {}
    for key, value in properties.items():
        if key not in ALLOWED_EVENT_PROPERTIES or not isinstance(value, (str, int, float, bool)):
            continue
        clean[key] = str(value)[:80]
    return clean


def record_product_event(user_id, name: str, properties: dict[str, Any]) -> bool:
    if name not in ALLOWED_PRODUCT_EVENTS or not feature_flags().get("product_events"):
        return False
    now = utc_now()
    feature_collection("product_events").insert_one({
        "user_id": user_id,
        "name": name,
        "properties": sanitize_event_properties(properties),
        "created_at": now,
        "delete_at": now + timedelta(days=90),
    })
    return True
