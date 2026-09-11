from __future__ import annotations

from functools import lru_cache
from ipaddress import ip_address, ip_network

from fastapi import Request

from app.config import settings


@lru_cache(maxsize=16)
def _trusted_networks(raw: str) -> tuple:
    networks = []
    for value in raw.split(","):
        candidate = value.strip()
        if candidate:
            networks.append(ip_network(candidate, strict=False))
    return tuple(networks)


def request_from_trusted_proxy(request: Request) -> bool:
    if not getattr(settings, "trust_proxy_headers", False):
        return False
    peer = request.client.host if request.client else ""
    try:
        address = ip_address(peer)
    except ValueError:
        return False
    return any(address in network for network in _trusted_networks(settings.trusted_proxy_cidrs))


def client_ip(request: Request) -> str:
    if request_from_trusted_proxy(request):
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            candidate = forwarded_for.split(",", 1)[0].strip()
            try:
                return str(ip_address(candidate))
            except ValueError:
                pass
    return request.client.host if request.client else "unknown"


def request_is_https(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    if not request_from_trusted_proxy(request):
        return False
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip().lower()
    return forwarded_proto == "https"
