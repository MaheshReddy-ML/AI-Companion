from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
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
