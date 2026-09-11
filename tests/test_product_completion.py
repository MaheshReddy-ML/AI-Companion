from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.access import access_profile, entitlements_for_plan, usage_limits_for_user
from app.inference.provider import ProviderCandidate, ProviderManager
from app.main import app
from app.models.schemas.chat import ChatSendRequest
from app.routers.api_chat import COMPANION_MODE_PROMPTS
from app.user_context import authoritative_account_reply, build_user_context


class FakeProvider:
    def __init__(self, name: str, *, healthy: bool = True, failure: str | None = None, chunks: list[str] | None = None):
        self.name = name
        self.healthy = healthy
        self.failure = failure
        self.chunks = chunks or [name]
        self.calls = 0

    def health_check(self):
        return self.healthy, "ready" if self.healthy else "unavailable"

    def generate(self, **_kwargs):
        self.calls += 1
        if self.failure:
            raise RuntimeError(self.failure)
        return self.name

    def stream(self, **_kwargs):
        self.calls += 1
        if self.failure:
            raise RuntimeError(self.failure)
        yield from self.chunks

    def runtime_stats(self):
        return {"model": f"{self.name}-model"}


def _candidate(provider: FakeProvider, priority: int, enabled: bool = True):
    return ProviderCandidate(provider.name, priority, enabled, lambda: provider)


def test_provider_manager_prefers_mlx_and_reports_active_provider():
    mlx = FakeProvider("mlx")
    local = FakeProvider("local")
    manager = ProviderManager([_candidate(local, 80), _candidate(mlx, 100)])

    assert manager.generate(model_id="qwen", messages=[], max_tokens=10, temperature=.1) == "mlx"
    assert mlx.calls == 1
    assert local.calls == 0
    assert manager.runtime_stats()["provider"] == "mlx"


def test_provider_manager_falls_back_once_and_never_selects_disabled_provider():
    mlx = FakeProvider("mlx", failure="runtime failed")
    disabled = FakeProvider("disabled")
    cloud = FakeProvider("cloud")
    manager = ProviderManager([_candidate(mlx, 100), _candidate(disabled, 90, False), _candidate(cloud, 50)])

    assert manager.generate(model_id="qwen", messages=[], max_tokens=10, temperature=.1) == "cloud"
    assert mlx.calls == 1
    assert disabled.calls == 0
    assert cloud.calls == 1
    assert "mlx" in manager.runtime_stats()["fallbackReason"]


def test_provider_manager_streams_and_returns_a_controlled_no_provider_error():
    local = FakeProvider("local", chunks=["one", "two"])
    assert list(ProviderManager([_candidate(local, 80)]).stream(model_id="qwen", messages=[], max_tokens=10, temperature=.1)) == ["one", "two"]
    with pytest.raises(RuntimeError, match="No healthy chat provider"):
        ProviderManager([_candidate(FakeProvider("off"), 100, False)]).generate(model_id="qwen", messages=[], max_tokens=10, temperature=.1)


def test_context_uses_current_profile_plan_entitlements_and_user_controls():
    user = {"name": "Mahesh", "email": "m@example.com", "subscription": {"plan": "pro", "status": "active"}}
    context = build_user_context(user, preferences={"responseStyle": "concise", "humor": "gentle"}, interaction_mode="honest", memories=[{"value": "I prefer Python"}])

    assert "Current authenticated display name: Mahesh" in context
    assert "Current authoritative plan: Pro" in context
    assert "Personal Constellation" in context
    assert "responseStyle: concise" in context
    assert "Current interaction mode: honest" in context
    assert "I prefer Python" in context


def test_account_facts_refresh_immediately_after_upgrade_and_downgrade():
    free = {"name": "Mahesh", "subscription": {"plan": "free", "status": "active"}}
    pro = {"name": "Mahesh", "subscription": {"plan": "pro", "status": "active"}}

    assert authoritative_account_reply(free, "What plan am I on?") == "You’re currently on the Free plan."
    assert authoritative_account_reply(pro, "What plan am I on?") == "You’re currently on the Pro plan."
    assert "full Personal Constellation" in authoritative_account_reply(free, "Can I use Personal Constellation?")
    assert authoritative_account_reply(pro, "Can I use Personal Constellation?").startswith("Yes")
    assert "I haven’t deleted anything" in authoritative_account_reply(pro, "Delete my memories")


def test_missing_name_and_stale_memory_never_override_authenticated_profile():
    assert "won’t guess" in authoritative_account_reply({}, "What's my name?")
    context = build_user_context({"name": "Mahesh"}, memories=[{"value": "My old name was Alex"}])
    assert "Current authenticated display name: Mahesh" in context
    assert "authenticated profile over conflicting old chat or memory" in context


def test_entitlements_are_cumulative_for_all_experience_depths():
    assert {"daily_drop", "moments", "taught_memory", "basic_ambient"} <= entitlements_for_plan("free")
    assert {"weekly_story", "expanded_ambient", "personalization"} <= entitlements_for_plan("plus")
    assert {"personal_constellation", "evolving_personality", "ambient_rooms"} <= entitlements_for_plan("pro")
    assert {"historical_constellation", "long_term_story"} <= entitlements_for_plan("complete")
    assert usage_limits_for_user({"subscription": {"plan": "complete", "status": "active"}})["moments"] > usage_limits_for_user({})["moments"]
    assert access_profile({"subscription": {"plan": "pro", "status": "expired"}})["plan"] == "free"


def test_every_interaction_mode_is_allowlisted_and_has_real_prompt_behavior():
    required = {"listen", "think", "distract", "laugh", "honest", "focus"}
    for mode in required:
        assert ChatSendRequest(message="hello", companionMode=mode).companion_mode == mode
        assert COMPANION_MODE_PROMPTS[mode]
    with pytest.raises(ValidationError):
        ChatSendRequest(message="hello", companionMode="pretend")


def test_experience_routes_and_existing_page_integrations_are_registered():
    paths = {route.path for route in app.routes}
    assert {
        "/api/experiences/moments", "/api/experiences/taught-memories", "/api/experiences/daily-drop",
        "/api/experiences/weekly-story", "/api/experiences/constellation", "/api/experiences/space",
    } <= paths

