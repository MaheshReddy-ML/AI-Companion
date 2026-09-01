from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.preferences import PREFERENCE_DEFAULTS
from app.product_operations import ALLOWED_PRODUCT_EVENTS, FLAG_DEFINITIONS, sanitize_event_properties


def test_product_operation_routes_and_public_surfaces_are_reachable():
    paths = {(route.path, method) for route in app.routes for method in getattr(route, "methods", set())}
    assert ("/api/product/bootstrap", "GET") in paths
    assert ("/api/product/onboarding", "PATCH") in paths
    assert ("/api/product/events", "POST") in paths
    assert ("/api/admin/feature-flags/{name}", "PUT") in paths
    assert ("/posts/{post_id}/mute", "POST") in paths
    assert ("/posts/{post_id}/block-author", "POST") in paths
    assert ("/posts/{post_id}/appeal", "POST") in paths
    assert ("/api/personal/goals/{goal_id}/pause", "PATCH") in paths
    assert ("/api/personal/goals/{goal_id}/archive", "PATCH") in paths
    client = TestClient(app)
    for path in ("/trust", "/status", "/changelog", "/offline", "/robots.txt", "/sitemap.xml", "/service-worker.js"):
        assert client.get(path).status_code == 200


def test_product_events_are_allowlisted_content_free_and_opt_in():
    assert PREFERENCE_DEFAULTS["productAnalytics"] is False
    assert "first_chat_completed" in ALLOWED_PRODUCT_EVENTS
    clean = sanitize_event_properties({"route": "/chat", "plan": "free", "message": "private text", "email": "private@example.com", "nested": {"private": True}})
    assert clean == {"route": "/chat", "plan": "free"}


def test_risky_capabilities_have_server_owned_flags():
    assert {"web_grounding", "scheduled_delivery", "community_writes"} <= set(FLAG_DEFINITIONS)


def test_locked_experiences_do_not_receive_onboarding_or_workspace_tools():
    client = TestClient(app)
    for path in ("/play", "/your-emora"):
        html = client.get(path).text
        assert "goal-onboarding" not in html
        assert "workspace-tools.js" not in html
        assert "emora-system.css" not in html
        assert "emora-system.js" not in html
    assert "goal-onboarding" in client.get("/dashboard").text


def test_normal_experiences_receive_shared_premium_system():
    client = TestClient(app)
    for path in ("/dashboard", "/chat", "/sessions", "/insights", "/journal", "/goals", "/research", "/community", "/notifications", "/profile", "/payment", "/help", "/trust"):
        html = client.get(path).text
        assert "emora-system.css" in html
        assert "emora-system.js" in html
        assert " emora-system" in html
        assert "motion.js" not in html
    assert "emora-system.css" in client.get("/").text


def test_first_route_transformations_have_semantic_controls():
    client = TestClient(app)
    home = client.get("/").text
    chat = client.get("/chat").text
    assert 'data-story-act="meet"' in home
    assert 'data-story-act="understand"' in home
    assert 'data-story-act="choose"' in home
    assert chat.count("data-chat-view=") == 3
    assert 'role="group" aria-label="Conversation view"' in chat
    assert 'id="jump-to-latest"' in chat
    assert "data-demo-journey" in home
    assert "Demonstration content—not your history" in home
    research = client.get("/research").text
    assert 'class="research-synthesis"' in research


def test_ui_state_lab_is_debug_only_and_covers_dynamic_state_contract(monkeypatch):
    client = TestClient(app)
    monkeypatch.setattr(settings, "companion_debug", False)
    assert client.get("/ui-lab").status_code == 404
    monkeypatch.setattr(settings, "companion_debug", True)
    html = client.get("/ui-lab").text
    assert "DEVELOPMENT FIXTURES" in html
    assert "emora-system.css" in html
    assert "emora-system.js" in html
    for state in ("loading", "empty", "ready", "offline", "unauthorized", "rate-limited", "conflict", "partial", "error", "locked"):
        assert f'data-emora-state="{state}"' in html


def test_workspace_rail_exposes_textual_presence_state():
    html = TestClient(app).get("/dashboard").text
    assert 'role="status" aria-live="polite"' in html
    assert "data-emora-presence-label" in html
    assert "data-emora-concierge-open" in html
    assert 'id="emora-contextual-concierge"' in html


def test_chat_stage_uses_full_room_and_locked_routes_keep_legacy_motion():
    client = TestClient(app)
    editorial_css = client.get("/static/css/workspace-editorial.css").text
    chat_css = client.get("/static/css/companion-chat.css").text
    system_css = client.get("/static/css/emora-system.css").text
    system_js = client.get("/static/js/emora-system.js").text
    chat_html = client.get("/chat").text
    stage_rule = editorial_css.split(".editorial-companion .chat-stage {", 1)[1].split("}", 1)[0]
    messages_rule = chat_css.split(".editorial-companion .messages-list {", 1)[1].split("}", 1)[0]
    assert "width: 100%" in stage_rule
    assert "max-width: none" in stage_rule
    assert "900px" not in stage_rule
    assert "right: 0" in messages_rule
    assert "left: 0" in messages_rule
    assert "margin-inline: auto" in messages_rule
    assert "transform: none" in messages_rule
    assert "right: 50%" not in messages_rule
    assert "20260901-message-centering-v2" in chat_html
    assert 'element.dataset.emoraReveal = "visible"' in system_js
    assert 'element.dataset.emoraReveal = "pending"' in system_js
    assert "pageState" not in system_js
    assert '[data-page-state="leaving"]' not in system_css
    for path in ("/play", "/your-emora"):
        assert "motion.js" in client.get(path).text
