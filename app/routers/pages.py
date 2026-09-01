from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from fastapi.templating import Jinja2Templates

from app.config import settings


router = APIRouter()
TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def render_page(request: Request, template_name: str, title: str) -> HTMLResponse:
    return templates.TemplateResponse(
        request=request,
        name=template_name,
        context={
            "request": request,
            "page_title": title,
            "google_client_id": settings.google_client_id,
            "companion_debug": settings.companion_debug,
        },
    )


@router.get("/", response_class=HTMLResponse)
def home_page(request: Request) -> HTMLResponse:
    return render_page(request, "home.html", "AI Companion")


@router.get("/login", response_class=HTMLResponse)
def login_page(request: Request) -> HTMLResponse:
    return render_page(request, "login.html", "Login")


@router.get("/register", response_class=HTMLResponse)
def register_page(request: Request) -> HTMLResponse:
    return render_page(request, "register.html", "Register")


@router.get("/forgot-password", response_class=HTMLResponse)
def forgot_password_page(request: Request) -> HTMLResponse:
    return render_page(request, "forgot_password.html", "Forgot Password")


@router.get("/verify-otp", response_class=HTMLResponse)
def verify_otp_page(request: Request) -> HTMLResponse:
    return render_page(request, "verify_otp.html", "Verify OTP")


@router.get("/reset-password", response_class=HTMLResponse)
def reset_password_page(request: Request) -> HTMLResponse:
    return render_page(request, "reset_password.html", "Reset Password")


@router.get("/dashboard", response_class=HTMLResponse)
def dashboard_page(request: Request) -> HTMLResponse:
    return render_page(request, "dashboard.html", "Dashboard")


@router.get("/chat", response_class=HTMLResponse)
def chat_page(request: Request) -> HTMLResponse:
    return render_page(request, "chat.html", "Chat with Emora")


@router.get("/your-emora", response_class=HTMLResponse)
def your_emora_page(request: Request) -> HTMLResponse:
    return render_page(request, "your_emora.html", "Meet Emora")


@router.get("/insights", response_class=HTMLResponse)
def insights_page(request: Request) -> HTMLResponse:
    return render_page(request, "insights.html", "Insights")


@router.get("/community", response_class=HTMLResponse)
def community_page(request: Request) -> HTMLResponse:
    return render_page(request, "community.html", "Community")


@router.get("/together", response_class=HTMLResponse)
def together_page(request: Request) -> HTMLResponse:
    return render_page(request, "together.html", "Together")


@router.get("/profile", response_class=HTMLResponse)
def profile_page(request: Request) -> HTMLResponse:
    return render_page(request, "profile.html", "Profile")


@router.get("/payment", response_class=HTMLResponse)
def payment_page(request: Request) -> HTMLResponse:
    return render_page(request, "payment.html", "Emora Plans")


@router.get("/play", response_class=HTMLResponse)
def play_page(request: Request) -> HTMLResponse:
    return render_page(request, "play.html", "Emora Play")


@router.get("/focus-together", response_class=HTMLResponse)
def focus_together_page(request: Request) -> HTMLResponse:
    return render_page(request, "focus_together.html", "Focus Together")


@router.get("/journal", response_class=HTMLResponse)
def journal_page(request: Request) -> HTMLResponse:
    return render_page(request, "journal.html", "Journal")


@router.get("/goals", response_class=HTMLResponse)
def goals_page(request: Request) -> HTMLResponse:
    return render_page(request, "goals.html", "Goals")


@router.get("/help", response_class=HTMLResponse)
def help_page(request: Request) -> HTMLResponse:
    return render_page(request, "help.html", "Help Center")


@router.get("/research", response_class=HTMLResponse)
def research_page(request: Request) -> HTMLResponse:
    return render_page(request, "research.html", "Research")


@router.get("/notifications", response_class=HTMLResponse)
def notifications_page(request: Request) -> HTMLResponse:
    return render_page(request, "notifications.html", "Notifications")


@router.get("/sessions", response_class=HTMLResponse)
def sessions_page(request: Request) -> HTMLResponse:
    return render_page(request, "sessions.html", "Emora Sessions")


@router.get("/trust", response_class=HTMLResponse)
def trust_page(request: Request) -> HTMLResponse:
    return render_page(request, "trust.html", "Trust Center")


@router.get("/status", response_class=HTMLResponse)
def status_page(request: Request) -> HTMLResponse:
    return render_page(request, "status.html", "Service Status")


@router.get("/changelog", response_class=HTMLResponse)
def changelog_page(request: Request) -> HTMLResponse:
    return render_page(request, "changelog.html", "Changelog")


@router.get("/offline", response_class=HTMLResponse, include_in_schema=False)
def offline_page(request: Request) -> HTMLResponse:
    return render_page(request, "offline.html", "Offline")


@router.get("/ui-lab", response_class=HTMLResponse, include_in_schema=False)
def ui_lab_page(request: Request) -> HTMLResponse:
    """Development-only, data-free fixtures for state and accessibility review."""
    if not settings.companion_debug:
        raise HTTPException(status_code=404)
    return render_page(request, "ui_lab.html", "UI State Lab")


@router.get("/robots.txt", response_class=PlainTextResponse, include_in_schema=False)
def robots() -> str:
    return "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard\nDisallow: /chat\nDisallow: /profile\nSitemap: " + settings.public_app_url.rstrip("/") + "/sitemap.xml\n"


@router.get("/sitemap.xml", include_in_schema=False)
def sitemap() -> Response:
    base = settings.public_app_url.rstrip("/")
    paths = ("/", "/help", "/trust", "/status", "/changelog")
    body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>{base}{path}</loc></url>" for path in paths) + "</urlset>"
    return Response(body, media_type="application/xml")


@router.get("/service-worker.js", include_in_schema=False)
def service_worker() -> Response:
    path = Path(__file__).resolve().parent.parent / "static" / "service-worker.js"
    return Response(path.read_text(encoding="utf-8"), media_type="application/javascript", headers={"Service-Worker-Allowed": "/", "Cache-Control": "no-cache"})
