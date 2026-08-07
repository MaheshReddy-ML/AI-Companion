from __future__ import annotations

from urllib.parse import urlencode

import httpx
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token

from app.config import settings

GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_SCOPES = "openid email profile"


def verify_google_id_token_value(token_value: str) -> dict:
    audiences = settings.google_audiences
    if not audiences:
        raise ValueError("Google auth is not configured on server")

    payload = id_token.verify_oauth2_token(token_value, GoogleRequest())
    if payload.get("aud") not in audiences:
        raise ValueError("Google token audience is not allowed")

    if not payload.get("email") or not payload.get("sub"):
        raise ValueError("Google token payload is incomplete")

    if not payload.get("email_verified"):
        raise ValueError("Google email is not verified")

    return payload


async def exchange_authorization_code(code: str) -> dict:
    if not settings.google_client_id or not settings.google_client_secret:
        raise ValueError("Google OAuth callback is not configured on server")

    payload = {
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_callback_url,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post("https://oauth2.googleapis.com/token", data=payload)

    if response.status_code >= 400:
        try:
            data = response.json()
            message = data.get("error_description") or data.get("error") or "Google token exchange failed"
        except Exception:
            message = "Google token exchange failed"
        raise ValueError(message)

    data = response.json()
    token_value = data.get("id_token")
    if not token_value:
        raise ValueError("Google callback did not return an ID token")

    return verify_google_id_token_value(token_value)


def build_google_authorization_url(state: str | None = None) -> str:
    if not settings.google_client_id:
        raise ValueError("Google auth is not configured on server")

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_callback_url,
        "response_type": "code",
        "scope": GOOGLE_OAUTH_SCOPES,
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "select_account",
    }
    if state:
        params["state"] = state

    return f"{GOOGLE_OAUTH_AUTHORIZE_URL}?{urlencode(params)}"


def append_query_to_url(base_url: str, params: dict[str, str | None]) -> str:
    filtered = {key: value for key, value in params.items() if value not in {None, ""}}
    if not filtered:
        return base_url

    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}{urlencode(filtered)}"
