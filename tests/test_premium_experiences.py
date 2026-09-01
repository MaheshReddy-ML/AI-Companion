from fastapi.testclient import TestClient

from app.access import entitlements_for_plan
from app.main import app
from app.routers.play import RoomRequest
from app.routers.premium_experiences import SESSION_CHANNELS, SESSION_ENVIRONMENTS, SESSION_MODES, _week_key


def test_premium_experience_routes_are_registered():
    paths = {(route.path, method) for route in app.routes for method in getattr(route, "methods", set())}
    assert {
        ("/api/premium/sessions", "GET"),
        ("/api/premium/sessions", "POST"),
        ("/api/premium/sessions/current", "GET"),
        ("/api/premium/sessions/{session_id}", "PATCH"),
        ("/api/premium/sessions/{session_id}/complete", "POST"),
        ("/api/premium/weekly-review", "GET"),
        ("/api/premium/weekly-review", "PUT"),
        ("/api/premium/memory-center", "GET"),
        ("/api/premium/memory-center/{memory_id}", "PATCH"),
        ("/api/premium/memory-center/{memory_id}", "DELETE"),
        ("/api/chat/turns/{client_turn_id}/cancel", "POST"),
    } <= paths


def test_sessions_page_exposes_real_guided_workflows():
    html = TestClient(app).get("/sessions").text
    assert "Begin Emora Session" in html
    assert "weekly-review-form" in html
    assert "memory-center-list" in html
    assert "/static/js/emora-sessions.js" in html
    assert "workspace-command-dialog" in html


def test_authenticated_logos_return_to_dashboard():
    client = TestClient(app)
    for path in ("/dashboard", "/chat", "/insights", "/community", "/profile", "/your-emora", "/sessions"):
        html = client.get(path).text
        assert 'href="/dashboard"' in html
    assert 'class="cinematic-brand" href="/"' in client.get("/").text
    assert 'href="/" aria-label="Emora home"' in client.get("/login").text


def test_premium_value_ladder_has_distinct_experience_entitlements():
    assert "guided_sessions" in entitlements_for_plan("free")
    assert {"memory_center", "weekly_review"} <= entitlements_for_plan("plus")
    assert {"deep_sessions", "research_studio"} <= entitlements_for_plan("pro")
    assert "personal_archive" in entitlements_for_plan("complete")


def test_session_and_focus_contracts_are_bounded():
    assert SESSION_MODES == {"listen", "reflect", "plan", "focus", "deep"}
    assert SESSION_CHANNELS == {"text", "voice"}
    assert "aurora" in SESSION_ENVIRONMENTS
    room = RoomRequest(name="Quiet work", minutes=50, focus_minutes=25, break_minutes=5, ambience="rain")
    assert room.focus_minutes == 25
    assert room.break_minutes == 5
    assert room.ambience == "rain"
    assert _week_key().count("-W") == 1
