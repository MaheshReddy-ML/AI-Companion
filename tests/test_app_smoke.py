from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app import main as app_main


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
        "/notifications",
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
        "/static/images/emora-logo-v2.png",
        "/static/images/emora-logo-v2-192.png",
        "/static/images/emora-logo-v2-64.png",
        "/static/images/emora-night-room-v1.webp",
        "/static/css/play-cinematic.css",
        "/static/css/focus-together.css",
        "/static/js/focus-together.js",
        "/static/css/workspace-editorial.css",
        "/static/css/light-theme.css",
        "/static/css/auth-doorway.css",
        "/static/css/notifications.css",
        "/static/js/notifications.js",
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


def test_browser_security_headers_cover_pages_static_assets_and_private_apis():
    client = TestClient(app)
    for path in ["/", "/chat", "/static/js/common.js", "/api/account/export"]:
        response = client.get(path)
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["x-permitted-cross-domain-policies"] == "none"
        assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
        assert response.headers["permissions-policy"] == "camera=(self), microphone=(self), geolocation=()"
        assert "object-src 'none'" in response.headers["content-security-policy-report-only"]
        assert "frame-ancestors 'none'" in response.headers["content-security-policy-report-only"]
        assert len(response.headers["x-request-id"]) == 32

    api_response = client.get("/api/account/export")
    assert api_response.status_code == 401
    assert api_response.headers["cache-control"] == "private, no-store"
    assert "strict-transport-security" not in client.get("/").headers


def test_home_uses_the_cinematic_emora_companion_scene():
    response = TestClient(app).get("/")

    assert "An AI companion" in response.text
    assert '<span>EMORA</span>' in response.text
    assert '<span>EMORA PLAY</span>' not in response.text
    assert 'src="/static/images/emora-logo-v2.png?v=20260828-orbit"' in response.text
    assert "Meet Emora" in response.text
    assert "data-cinematic-mount" in response.text
    assert "landing-vrm-stage" not in response.text


def test_emora_brand_mark_is_available_across_platform_surfaces():
    client = TestClient(app)
    favicon = '<link rel="icon" type="image/png" sizes="64x64" href="/static/images/emora-logo-v2-64.png?v=20260828-orbit" />'

    for path in ["/", "/login", "/register", "/dashboard", "/chat", "/insights", "/community", "/profile", "/payment", "/play", "/focus-together", "/journal", "/goals", "/help", "/research"]:
        assert favicon in client.get(path).text

    for path in ["/chat", "/insights", "/community", "/profile", "/forgot-password", "/verify-otp", "/reset-password"]:
        assert 'src="/static/images/emora-logo-v2-' in client.get(path).text or 'src="/static/images/emora-logo-v2.png' in client.get(path).text

    assert client.get("/favicon.ico", follow_redirects=False).headers["location"].startswith("/static/images/emora-logo-v2-64.png")


def test_notification_center_is_actionable_friendly_and_motion_safe():
    client = TestClient(app)
    page = client.get("/notifications").text
    css = client.get("/static/css/notifications.css").text
    script = client.get("/static/js/notifications.js").text

    assert "Small things worth" in page
    assert 'data-notification-filter="unread"' in page
    assert 'data-notification-filter="security"' in page
    assert "notification-celebration" in page
    assert "notification-live-note" in page
    assert "EMORA IS HERE" in page
    assert "prefers-reduced-motion:reduce" in css
    assert "@media(max-width:390px)" in css
    assert "refreshNotificationBadge" in script
    assert "actionLabel" in script
    assert "notificationResponse" in script
    assert "restartLiveRotation" in script


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


def test_workspace_upgrade_access_lives_in_sidebars_not_floating_over_pages():
    client = TestClient(app)

    for path in ["/dashboard", "/chat", "/insights", "/community", "/profile"]:
        response = client.get(path)
        assert 'class="sidebar-plan-access"' in response.text
        assert 'href="/payment"' in response.text
        assert "Unlock deeper insights" in response.text

    for path in ["/dashboard", "/chat", "/insights", "/community", "/profile", "/your-emora", "/play"]:
        assert 'class="global-premium-access"' not in client.get(path).text


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


def test_light_theme_contract_is_loaded_last_and_scoped_away_from_locked_pages():
    client = TestClient(app)
    dashboard = client.get("/dashboard").text
    light_theme = client.get("/static/css/light-theme.css").text

    assert dashboard.index("workspace-editorial.css") < dashboard.index("light-theme.css")
    assert ".light body.editorial-overview" in light_theme
    assert ".light body.profile-settings-page" in light_theme
    assert ".light body.focus-together-body" in light_theme
    assert ".light .play-world" not in light_theme
    assert ".light .your-emora" not in light_theme


def test_product_depth_stays_inside_existing_sections():
    client = TestClient(app)

    dashboard = client.get("/dashboard").text
    assert 'id="arrival-form"' in dashboard
    assert 'data-dashboard-tiny' in dashboard
    assert 'id="dashboard-lookback"' in dashboard
    assert 'id="dashboard-emora"' in dashboard
    assert 'id="dashboard-memory"' in dashboard
    assert 'value="heavy"' in dashboard
    assert "YOUR SPACE IS QUIET" in dashboard
    assert "Welcome back," in dashboard
    assert "No prompt, no pressure." in dashboard
    assert 'data-dashboard-flow' in dashboard
    assert 'data-dashboard-orbit-goals' in dashboard
    assert 'data-dashboard-ambient' in dashboard
    assert 'data-dashboard-insight-lock' in dashboard
    assert 'data-dashboard-insight-period' in dashboard
    assert "30-day summary" in dashboard
    assert 'id="daily-emora-drop"' in dashboard
    assert 'id="weekly-story-summary"' in dashboard
    assert 'id="constellation-preview"' in dashboard
    assert "TEACH EMORA" in dashboard

    companion = client.get("/chat").text
    assert 'data-companion-mode="distract"' in companion
    assert 'data-companion-mode="laugh"' in companion
    assert 'data-companion-mode="honest"' in companion
    assert 'data-companion-mode="focus"' in companion
    assert 'value="night_wind"' in companion
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
    assert 'id="companion-environment-grid" role="radiogroup"' in companion
    assert 'id="companion-environment-status" aria-live="polite"' in companion

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
        assert "sidebar-scroll-region" in client.get(path).text
        assert "shared-workspace-rail" in client.get(path).text

    editorial_css = client.get("/static/css/workspace-editorial.css").text
    companion_css = client.get("/static/css/companion-chat.css").text
    shell_css = client.get("/static/css/emora-overrides.css").text
    assert ".light .editorial-workspace" in editorial_css
    assert ".editorial-overview .dashboard-glance" in editorial_css
    assert "dashboardPresenceBreath" in editorial_css
    assert ".orbit-insight-lock" in editorial_css
    workspace_js = client.get("/static/js/workspace-shell.js").text
    assert 'apiRequest("/api/insights?days=30"' in workspace_js
    assert "insights?.access?.advancedInsights" in workspace_js
    assert "brief.consistencyPercent" in workspace_js
    assert "insights.historicalObservations" in workspace_js
    assert ".light .editorial-companion" in companion_css
    assert ".sidebar-scroll-region" in shell_css
    assert "overflow-y: hidden" in shell_css

    for path in ["/dashboard", "/chat", "/insights", "/journal", "/goals", "/community"]:
        html = client.get(path).text
        assert 'href="/mood"' not in html
        assert 'href="/memories"' not in html
        assert 'href="/reflection"' not in html


def test_community_has_premium_privacy_first_feed_controls():
    client = TestClient(app)
    community = client.get("/community").text
    community_js = client.get("/static/js/community.js").text
    community_css = client.get("/static/css/workspace-editorial.css").text

    assert 'id="community-pulse-reflections"' in community
    assert 'id="community-pulse-support"' in community
    assert 'data-community-filter="latest"' in community
    assert 'data-community-filter="related"' in community
    assert 'data-community-filter="mine"' in community
    assert 'role="tab" aria-selected="false" aria-controls="community-panel-privacy"' in community
    assert 'role="tab" aria-selected="false" aria-controls="community-panel-support"' in community
    assert 'data-community-principle-panel="privacy"' in community
    assert 'data-community-principle-panel="support"' in community
    assert 'data-community-prompt=' in community
    assert 'id="community-report-dialog"' in community
    assert 'name="reason" value="medical_advice"' in community
    assert 'href="/focus-together"' in community
    assert 'apiRequest(`/posts/${state.reportingPostId}/report`' in community_js
    assert "getFilteredPosts" in community_js
    assert "activatePrinciple" in community_js
    assert 'event.key === "ArrowRight"' in community_js
    assert ".editorial-community .community-intro" in community_css
    assert ".editorial-community .community-pulse" in community_css


def test_workspace_sections_expose_working_selection_and_empty_state_contracts():
    client = TestClient(app)
    insights = client.get("/insights").text
    profile = client.get("/profile").text
    focus = client.get("/focus-together").text
    help_page = client.get("/help").text
    workspace_js = client.get("/static/js/workspace-shell.js").text
    profile_js = client.get("/static/js/profile.js").text
    focus_js = client.get("/static/js/focus-together.js").text
    personal_js = client.get("/static/js/personal.js").text
    library_js = client.get("/static/js/library.js").text
    payment_js = client.get("/static/js/payment.js").text

    assert 'id="insight-range-picker" role="radiogroup"' in insights
    assert 'class="workspace-section-nav" aria-label="Insights sections"' in insights
    assert 'id="insights-patterns"' in insights
    assert 'aria-pressed="false" data-mood="calm"' in insights
    assert 'class="workspace-section-nav profile-section-nav"' in profile
    assert 'role="tab" aria-selected="true" tabindex="0" data-avatar-filter="all"' in profile
    assert 'id="profile-companion"' in profile
    assert 'class="focus-presets" role="radiogroup"' in focus
    assert 'id="help-search-state" role="status"' in help_page
    assert 'id="help-search-empty" hidden' in help_page
    assert 'setAttribute("aria-checked"' in workspace_js
    assert 'setAttribute("aria-selected"' in profile_js
    assert 'focusDurationButtons' in focus_js
    assert 'class="personal-empty"' in personal_js
    assert 'filterHelpTopics' in library_js
    assert 'bindChoiceKeyboard(".payment-methods"' in payment_js


def test_health_and_admin_diagnostics_protection():
    client = TestClient(app)

    assert client.get("/health").status_code == 200
    assert client.get("/api/admin/diagnostics").status_code in {403, 404}


def test_readiness_uses_service_unavailable_when_mongodb_is_not_ready(monkeypatch):
    monkeypatch.setattr(
        app_main,
        "check_database_connection",
        lambda: {"ok": False, "database": "emora_test", "error": "unavailable"},
    )
    response = TestClient(app).get("/health/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"


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

    assert "companion-chat.css?v=20260901-message-centering-v2" in page
    assert "@media (max-height: 920px) and (min-width: 901px)" in styles


def test_chat_environment_picker_is_persistent_accessible_and_overview_aligned():
    client = TestClient(app)
    runtime = client.get("/static/js/dashboard.js").text
    companion = client.get("/static/css/companion-chat.css").text
    workspace = client.get("/static/css/workspace-editorial.css").text
    light_theme = client.get("/static/css/light-theme.css").text

    assert 'apiRequest("/api/experiences/space", { auth: true })' in runtime
    assert 'apiRequest("/api/experiences/space", { method: "PUT"' in runtime
    assert 'document.documentElement.dataset.emoraEnvironment = state.environment' in runtime
    assert 'role="radio" aria-checked=' in runtime
    assert '"ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"' in runtime
    for environment in ("midnight", "dawn", "rainy-window", "quiet-forest", "deep-ocean", "observatory", "fireplace", "space", "aurora"):
        assert f'data-emora-environment="{environment}"' in companion
    assert "One workspace color standard: Overview is the reference palette." in workspace
    assert "--editorial-teal: #81aef7" in workspace
    assert "--light-accent: #4c72c9" in light_theme


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
    assert 'env(safe-area-inset-bottom,0px)' in workspace
    assert 'body:is(.editorial-workspace,.profile-settings-page,.focus-together-body,.library-body)' in workspace
    assert '.play-world' not in workspace.split("Mobile comfort:", 1)[-1]
    assert '.your-emora' not in workspace.split("Mobile comfort:", 1)[-1]
    assert 'body[data-access-paid="true"] .sidebar-plan-access' in overrides
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
