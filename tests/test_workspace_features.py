from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.routers.workspace_features import _schedule_due, _validate_restore


def test_all_workspace_feature_routes_are_registered():
    paths = {(route.path, method) for route in app.routes for method in getattr(route, "methods", set())}
    expected = {
        ("/api/workspace/search", "GET"),
        ("/api/workspace/sessions", "GET"),
        ("/api/workspace/collections", "POST"),
        ("/api/workspace/feedback", "PUT"),
        ("/api/workspace/research-shelf", "GET"),
        ("/api/workspace/schedule", "PUT"),
        ("/api/workspace/schedule/due", "GET"),
        ("/api/workspace/privacy-summary", "GET"),
        ("/api/workspace/restore/preview", "POST"),
        ("/api/workspace/restore/commit", "POST"),
    }
    assert expected <= paths


def test_restore_accepts_only_versioned_bounded_emora_archives():
    _validate_restore({"format": "emora-account-export.v1", "conversations": []})
    with pytest.raises(HTTPException) as wrong_format:
        _validate_restore({"format": "unknown"})
    assert wrong_format.value.status_code == 400
    with pytest.raises(HTTPException) as wrong_shape:
        _validate_restore({"format": "emora-account-export.v1", "goals": {}})
    assert wrong_shape.value.status_code == 400


def test_check_in_due_respects_consent_day_time_quiet_hours_and_acknowledgement():
    monday_1830 = datetime(2026, 8, 24, 18, 30, tzinfo=timezone.utc)
    schedule = {"enabled": True, "days": [1], "time": "18:00", "timezone": "UTC", "quiet_start": "21:00", "quiet_end": "08:00"}
    assert _schedule_due(schedule, monday_1830) == (True, "2026-08-24")
    assert _schedule_due({**schedule, "enabled": False}, monday_1830)[0] is False
    assert _schedule_due({**schedule, "last_acknowledged_date": "2026-08-24"}, monday_1830)[0] is False
    assert _schedule_due({**schedule, "quiet_start": "18:15", "quiet_end": "20:00"}, monday_1830)[0] is False


def test_workspace_tools_stay_off_locked_experiences():
    client = TestClient(app)
    for path in ("/play", "/your-emora"):
        html = client.get(path).text
        assert "workspace-command-dialog" not in html
        assert "workspace-tools.js" not in html
    for path in ("/dashboard", "/chat", "/profile", "/research"):
        html = client.get(path).text
        assert "workspace-command-dialog" in html
        assert "workspace-tools.js" in html
        assert "Search your space" in html
        assert "Chats, journal, goals and more" in html


def test_feature_ui_contracts_are_reachable():
    client = TestClient(app)
    profile = client.get("/profile").text
    chat = client.get("/chat").text
    research = client.get("/research").text
    assert "check-in-schedule-form" in profile
    assert "profile-session-list" in profile
    assert "account-restore-preview" in profile
    assert "privacy-count-grid" in profile
    assert "collection-list" in chat
    assert "Research shelf" in research
    assert "/static/js/library.js" in research
