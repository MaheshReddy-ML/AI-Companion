from fastapi.testclient import TestClient

from app.main import app


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
        "/play",
        "/journal",
        "/goals",
        "/help",
        "/research",
    ]:
        response = client.get(path)
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]


def test_core_static_assets_are_served():
    client = TestClient(app)
    for path in [
        "/static/css/styles.css",
        "/static/js/common.js",
        "/static/js/dashboard.js",
        "/static/js/community.js",
    ]:
        response = client.get(path)
        assert response.status_code == 200


def test_health_and_admin_diagnostics_protection():
    client = TestClient(app)

    assert client.get("/health").status_code == 200
    assert client.get("/api/admin/diagnostics").status_code in {403, 404}


def test_voice_generation_requires_an_authenticated_session():
    client = TestClient(app)
    response = client.post("/api/voices/speak", json={"text": "Hello"})

    assert response.status_code == 401
