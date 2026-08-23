from fastapi.testclient import TestClient

from app.main import app
from app.config import settings


def test_public_pages_render_successfully():
    client = TestClient(app)
    for path in [
        "/",
        "/login",
        "/register",
        "/forgot-password",
        "/verify-otp",
        "/reset-password",
        "/dashboard",
        "/chat",
        "/your-emora",
        "/insights",
        "/community",
        "/profile",
        "/payment",
        "/play",
        "/focus-together",
        "/journal",
        "/goals",
        "/help",
        "/research",
    ]:
        response = client.get(path)
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]


def test_authentication_states_share_the_doorway_shell_without_extra_registration_questions():
    client = TestClient(app)
    for path in ["/login", "/register", "/forgot-password", "/verify-otp", "/reset-password"]:
        page = client.get(path).text
        assert 'class="emora-auth"' in page
        assert 'class="auth-doorway-story"' in page
        assert "/static/css/auth-doorway.css" in page
        assert "data-atmosphere-scene" in page

    registration = client.get("/register").text
    assert 'id="name"' in registration
    assert 'id="email"' in registration
    assert 'id="register-password"' in registration
    assert "starting-mood" not in registration
    assert "care-consent" not in registration


def test_core_static_assets_are_served():
    client = TestClient(app)
    for path in [
        "/static/css/styles.css",
        "/static/js/common.js",
        "/static/js/dashboard.js",
        "/static/js/community.js",
        "/static/css/payment.css",
        "/static/js/payment.js",
        "/static/css/home-flagship.css",
        "/static/js/home.js",
        "/static/js/cinematic-room.js",
        "/static/images/logo.svg",
        "/static/images/logo.png",
        "/static/images/emora-night-room-v1.webp",
        "/static/css/play-cinematic.css",
        "/static/css/focus-together.css",
        "/static/js/focus-together.js",
        "/static/css/workspace-editorial.css",
        "/static/css/auth-doorway.css",
    ]:
        response = client.get(path)
        assert response.status_code == 200


def test_development_responses_cannot_reuse_stale_localhost_assets():
    client = TestClient(app)
    static_response = client.get(
        "/static/css/styles.css",
        headers={
            "If-None-Match": '"stale-local-copy"',
            "If-Modified-Since": "Wed, 21 Oct 2015 07:28:00 GMT",
        },
    )
    page_response = client.get("/chat")

    assert static_response.status_code == 200
    assert static_response.headers["cache-control"] == "no-store, no-cache, must-revalidate, max-age=0"
    assert "etag" not in static_response.headers
    assert "last-modified" not in static_response.headers
    assert page_response.headers["clear-site-data"] == '"cache"'


def test_home_uses_the_cinematic_emora_play_scene():
    response = TestClient(app).get("/")

    assert "The part of your day" in response.text
    assert '<span>EMORA</span>' in response.text
    assert '<span>EMORA PLAY</span>' not in response.text
    assert 'src="/static/images/logo.svg?v=20260822-emora-mark"' in response.text
    assert "Step into Play" in response.text
    assert "data-cinematic-mount" in response.text
    assert "landing-vrm-stage" not in response.text


def test_emora_brand_mark_is_available_across_platform_surfaces():
    client = TestClient(app)
    favicon = '<link rel="icon" type="image/svg+xml" href="/static/images/logo.svg?v=20260822-emora-mark" />'

    for path in ["/", "/login", "/register", "/dashboard", "/chat", "/insights", "/community", "/profile", "/payment", "/play", "/focus-together", "/journal", "/goals", "/help", "/research"]:
        assert favicon in client.get(path).text

    for path in ["/chat", "/insights", "/community", "/profile", "/forgot-password", "/verify-otp", "/reset-password"]:
        assert 'src="/static/images/logo.svg?v=20260822-emora-mark"' in client.get(path).text


def test_play_keeps_features_inside_the_cinematic_world():
    response = TestClient(app).get("/play")

    assert "data-play-room-mount" in response.text
    assert "Make your inner" in response.text
    assert 'id="quest-list"' in response.text
    assert 'id="memory-form"' in response.text
    assert 'href="/focus-together"' in response.text
    assert 'id="focus-room-form"' not in response.text
    assert 'id="space-form"' in response.text
    assert 'id="remix-form"' in response.text
    assert 'id="ritual-archive-list"' in response.text
    assert 'data-entitlement="look_back"' in response.text
    assert 'value="observatory"' in response.text
    assert 'value="gentle_goal"' in response.text
    assert 'id="keepsake-create"' in response.text
    assert 'data-entitlement="voice_postcards"' in response.text
    assert "garden-preview" not in response.text


def test_focus_together_is_a_dedicated_entitlement_protected_section():
    client = TestClient(app)
    response = client.get("/focus-together")

    assert response.status_code == 200
    assert "Quiet company," in response.text
    assert 'data-entitlement="focus_rooms"' in response.text
    assert 'id="focus-room-form"' in response.text
    assert 'id="focus-join-form"' in response.text
    assert 'data-focus-minutes="15"' in response.text
    assert 'data-focus-minutes="25"' in response.text
    assert 'data-focus-minutes="50"' in response.text
    assert 'data-focus-unlimited="true"' in response.text
    assert 'id="focus-live-members"' in response.text
    assert 'id="focus-participant-list"' in response.text
    assert 'id="focus-copy-code"' in response.text
    assert 'id="focus-end-session"' in response.text
    assert 'id="focus-shared-chat"' in response.text
    assert 'id="focus-chat-messages"' in response.text
    assert 'id="focus-chat-form"' in response.text
    assert 'id="focus-mention-menu"' in response.text
    assert "The conversation is deleted when the session ends." in response.text
    assert "No profiles" in response.text
    assert "No public score" in response.text
    assert 'href="/play"' in response.text

    community = client.get("/community").text
    assert 'href="/focus-together"' in community
    assert 'id="focus-room-create-form"' not in community


def test_workspace_pages_expose_upgrade_access():
    response = TestClient(app).get("/your-emora")

    assert 'class="global-premium-access"' in response.text
    assert 'href="/payment"' in response.text
    assert "ACCOUNT ACCESS" in response.text
    assert "Checking access…" in response.text


def test_admin_access_copy_is_explicit_in_shared_chrome_assets():
    common_js = TestClient(app).get("/static/js/common.js").text

    assert 'kicker: "PLATFORM ADMIN"' in common_js
    assert 'label: "Full platform access"' in common_js
    assert 'compact: "Admin · Full access"' in common_js


def test_editorial_workspace_is_scoped_away_from_locked_emora_pages():
    client = TestClient(app)

    for path in ["/dashboard", "/chat", "/insights", "/journal", "/goals", "/community"]:
        assert "editorial-workspace" in client.get(path).text

    for path in ["/play", "/your-emora"]:
        assert "editorial-workspace" not in client.get(path).text


def test_product_depth_stays_inside_existing_sections():
    client = TestClient(app)

    dashboard = client.get("/dashboard").text
    assert 'id="arrival-form"' in dashboard
    assert 'data-dashboard-tiny' in dashboard
    assert 'id="dashboard-lookback"' in dashboard
    assert 'id="dashboard-emora"' in dashboard
    assert 'id="dashboard-memory"' in dashboard
    assert 'value="heavy"' in dashboard

    companion = client.get("/chat").text
    assert 'id="companion-tools"' in companion
    assert 'data-companion-mode' in companion
    assert 'data-companion-mode="reflect"' in companion
    assert 'id="companion-memory-form"' in companion
    assert 'data-entitlement="conversation_export"' in companion
    assert 'data-entitlement="voice"' in companion
    assert 'data-entitlement="extended_chat"' in companion
    assert 'id="remix-journal-button"' in companion
    assert 'data-companion-mode="deep"' in companion
    assert 'id="session-reflection-button"' in companion

    assert "Meet Emora" in dashboard
    assert "Chat with Emora" in dashboard
    assert "Your Emora" not in dashboard
    assert 'localStorage.getItem("theme") || "system"' in dashboard
    assert "Chat with Emora" in companion
    assert 'data-emora-live-state' in companion
    assert 'data-play-progress' in companion
    assert 'href="/play" aria-label="Emora Play"' in companion

    play_page = client.get("/play").text
    assert 'id="play-living-progress"' in play_page
    assert 'id="play-completion-layer"' in play_page
    assert 'id="play-milestone-list"' in play_page

    assert 'id="insights-lookback"' in client.get("/insights").text
    assert 'data-journal-prompt' in client.get("/journal").text
    assert 'id="journal-cancel-edit"' in client.get("/journal").text
    assert "TODAY’S TINY THING" in client.get("/static/js/personal.js").text
    assert 'href="/focus-together"' in client.get("/community").text
    assert 'href="/profile" aria-label="Open profile and settings"' in client.get("/community").text

    for path in ["/dashboard", "/chat", "/insights", "/community", "/profile"]:
        account_html = client.get(path).text
        assert "data-theme-toggle" in account_html
        assert "data-logout" in account_html
    for path in ["/chat", "/insights", "/community", "/profile"]:
        assert 'class="sidebar-scroll-region"' in client.get(path).text

    editorial_css = client.get("/static/css/workspace-editorial.css").text
    companion_css = client.get("/static/css/companion-chat.css").text
    shell_css = client.get("/static/css/emora-overrides.css").text
    assert ".light .editorial-workspace" in editorial_css
    assert ".light .editorial-companion" in companion_css
    assert ".sidebar-scroll-region" in shell_css
    assert "overflow-y: hidden" in shell_css

    for path in ["/dashboard", "/chat", "/insights", "/journal", "/goals", "/community"]:
        html = client.get(path).text
        assert 'href="/mood"' not in html
        assert 'href="/memories"' not in html
        assert 'href="/reflection"' not in html


def test_health_and_admin_diagnostics_protection():
    client = TestClient(app)

    assert client.get("/health").status_code == 200
    assert client.get("/api/admin/diagnostics").status_code in {403, 404}


def test_voice_generation_requires_an_authenticated_session():
    client = TestClient(app)
    response = client.post("/api/voices/speak", json={"text": "Hello"})

    assert response.status_code == 401


def test_companion_telemetry_panel_is_opt_in(monkeypatch):
    client = TestClient(app)

    assert "Developer telemetry" not in client.get("/your-emora").text
    monkeypatch.setattr(settings, "companion_debug", True)
    assert "Developer telemetry" in client.get("/your-emora").text


def test_your_emora_chat_boot_is_independent_from_optional_vrm_runtime():
    client = TestClient(app)
    page = client.get("/your-emora").text
    runtime = client.get("/static/js/your-emora.js").text

    assert "20260823-web-intelligence-v1" in page
    assert 'import { createEmoraAvatarStage }' not in runtime
    assert "await import(AVATAR_STAGE_MODULE)" in runtime
    assert runtime.index("bindEvents();") < runtime.index("void initializeAvatarStage();")


def test_chat_boot_does_not_wait_on_optional_companion_tools():
    runtime = TestClient(app).get("/static/js/dashboard.js").text

    assert "Promise.allSettled" in runtime
    assert "await Promise.all([fetchConversations(), loadCompanionTools()])" not in runtime


def test_companion_room_uses_compact_spacing_for_laptop_height():
    client = TestClient(app)
    page = client.get("/chat").text
    styles = client.get("/static/css/companion-chat.css").text

    assert "companion-chat.css?v=20260823-responsive-room-v3" in page
    assert "@media (max-height: 920px) and (min-width: 901px)" in styles


def test_final_responsive_light_and_icon_regressions_are_present():
    client = TestClient(app)
    companion = client.get("/static/css/companion-chat.css").text
    workspace = client.get("/static/css/workspace-editorial.css").text
    overrides = client.get("/static/css/emora-overrides.css").text
    polish = client.get("/static/css/polish.css").text
    profile = client.get("/static/css/profile-insights.css").text
    focus = client.get("/static/css/focus-together.css").text

    assert '.sidebar .nav-item-icon::after' in companion
    assert 'content: none !important' in companion
    assert 'container-name: companion-workspace' in companion
    assert '@container companion-workspace (max-width: 1350px)' in companion
    assert 'url("/static/images/emora-night-room-v1.webp")' in companion
    assert 'url("/static/images/emora-companion-room-v1.webp")' not in companion
    assert '.sidebar .nav-item-icon::after' in workspace
    assert '.light body[data-access-paid="true"] .global-premium-access' in overrides
    assert 'repeat(8, minmax(56px, 1fr))' in polish
    assert '.light :is(.profile-header,.settings-section' in profile
    assert '.focus-chat-composer' in focus and 'grid-template-columns: 1fr' in focus


def test_insights_exposes_real_plan_gated_premium_brief():
    page = TestClient(app).get("/insights").text

    assert 'class="insights-premium-brief"' in page
    assert 'data-entitlement="advanced_insights"' in page
    assert 'id="premium-tone-direction"' in page
    assert "workspace-shell.js?v=20260822-premium-depth-v2" in page
    assert 'class="insights-period-reflection"' in page
    assert 'id="reflection-timeline"' in page
    assert 'data-insight-days="90" data-entitlement="look_back"' in page
    assert 'data-insight-days="365" data-entitlement="advanced_insights"' in page
