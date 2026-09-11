from __future__ import annotations

from typing import Any

from app.config import settings


PLAN_ORDER = ("free", "plus", "pro", "complete")

PLAN_CATALOG: dict[str, dict[str, Any]] = {
    "free": {
        "name": "Free",
        "tagline": "A private place to begin",
        "monthly": 0,
        "yearly": 0,
        "features": ["Text companion", "Journal and gentle goals", "Community reflections", "Basic insights"],
    },
    "plus": {
        "name": "Plus",
        "tagline": "More continuity with Emora",
        "monthly": 499,
        "yearly": 4790,
        "features": ["Everything in Free", "Voice conversations", "Expanded companion memory with review controls", "Weekly Review, Look Back, Ritual Archive, and exports"],
    },
    "pro": {
        "name": "Pro",
        "tagline": "Deeper reflection and personalisation",
        "monthly": 899,
        "yearly": 8630,
        "features": ["Everything in Plus", "Guided Emora and Deep Sessions", "World Atelier and shared Emora focus rooms", "Research Studio, reflection timeline, and adaptive context"],
    },
    "complete": {
        "name": "Complete",
        "tagline": "Every Emora capability",
        "monthly": 1499,
        "yearly": 14390,
        "features": ["Everything in Pro", "Private long-term archive and voice keepsakes", "Extended usage limits", "Priority local generation", "Carefully selected early access"],
    },
}

PLAN_ENTITLEMENTS = {
    "free": {
        "text_chat", "journal", "gentle_goals", "community", "basic_insights", "data_controls",
        "daily_drop", "moments", "taught_memory", "starter_environments", "basic_ambient", "guided_sessions",
    },
    "plus": {
        "voice", "extended_chat", "companion_memory", "conversation_export", "look_back",
        "weekly_story", "expanded_moments", "expanded_taught_memory", "expanded_environments",
        "expanded_ambient", "personalization", "memory_center", "weekly_review",
    },
    "pro": {
        "conversation_remix", "ambient_rooms", "focus_rooms", "advanced_insights", "adaptive_companion",
        "deep_conversation", "session_reflection", "personal_constellation", "advanced_moments",
        "evolving_personality", "advanced_personalization", "deep_sessions", "research_studio",
    },
    "complete": {
        "voice_postcards", "extended_limits", "priority_generation", "early_access",
        "historical_constellation", "long_term_story", "complete_personalization", "personal_archive",
    },
}

PLAN_LIMITS = {
    "free": {"chatMessageCharacters": 2_000, "chatHistoryMessages": 8, "chatConcurrentRequests": 1, "ttsCharacters": 0, "ttsConcurrentRequests": 0, "webSearchesPerHour": 5},
    "plus": {"chatMessageCharacters": 8_000, "chatHistoryMessages": 16, "chatConcurrentRequests": 2, "ttsCharacters": 3_000, "ttsConcurrentRequests": 2, "webSearchesPerHour": 20},
    "pro": {"chatMessageCharacters": 8_000, "chatHistoryMessages": 16, "chatConcurrentRequests": 2, "ttsCharacters": 3_000, "ttsConcurrentRequests": 2, "webSearchesPerHour": 40},
    "complete": {"chatMessageCharacters": 12_000, "chatHistoryMessages": 24, "chatConcurrentRequests": 4, "ttsCharacters": 5_000, "ttsConcurrentRequests": 4, "webSearchesPerHour": 80},
}

EXPERIENCE_LIMITS = {
    "free": {"moments": 12, "taughtMemories": 5, "constellationNodes": 4},
    "plus": {"moments": 100, "taughtMemories": 30, "constellationNodes": 8},
    "pro": {"moments": 500, "taughtMemories": 100, "constellationNodes": 24},
    "complete": {"moments": 2_000, "taughtMemories": 500, "constellationNodes": 60},
}


def normalized_email(value: str | None) -> str:
    return (value or "").strip().lower()


def is_platform_admin(user: dict | None) -> bool:
    if not user:
        return False
    return normalized_email(user.get("email")) in settings.admin_email_set or user.get("role") == "admin"


def active_plan_for_user(user: dict) -> str:
    if is_platform_admin(user):
        return "complete"
    subscription = user.get("subscription") or {}
    plan = str(subscription.get("plan", "free")).lower()
    status = str(subscription.get("status", "inactive")).lower()
    return plan if plan in PLAN_CATALOG and status in {"active", "trialing"} else "free"


def entitlements_for_plan(plan: str) -> set[str]:
    selected_index = PLAN_ORDER.index(plan) if plan in PLAN_ORDER else 0
    return set().union(*(PLAN_ENTITLEMENTS[name] for name in PLAN_ORDER[: selected_index + 1]))


def access_profile(user: dict) -> dict[str, Any]:
    admin = is_platform_admin(user)
    plan = active_plan_for_user(user)
    entitlements = entitlements_for_plan(plan)
    if admin:
        entitlements.add("admin_console")
    subscription = user.get("subscription") or {}
    return {
        "plan": "admin" if admin else plan,
        "planName": "Administrator" if admin else PLAN_CATALOG[plan]["name"],
        "isAdmin": admin,
        "status": "active" if admin else "free" if plan == "free" else subscription.get("status", "active"),
        "entitlements": sorted(entitlements),
        "limits": {**PLAN_LIMITS[plan], **EXPERIENCE_LIMITS[plan]},
    }


def has_entitlement(user: dict, entitlement: str) -> bool:
    return entitlement in access_profile(user)["entitlements"]


def usage_limits_for_user(user: dict) -> dict[str, int]:
    plan = active_plan_for_user(user)
    return {**PLAN_LIMITS[plan], **EXPERIENCE_LIMITS[plan]}


def public_plan_catalog() -> list[dict[str, Any]]:
    return [{"id": plan_id, **PLAN_CATALOG[plan_id], "limits": {**PLAN_LIMITS[plan_id], **EXPERIENCE_LIMITS[plan_id]}} for plan_id in PLAN_ORDER]
