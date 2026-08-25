from __future__ import annotations

from collections import defaultdict
from threading import Lock


_lock = Lock()
_requests: dict[tuple[str, str, int], dict[str, float]] = defaultdict(
    lambda: {"count": 0, "total_ms": 0.0, "max_ms": 0.0}
)


def observe_request(method: str, route: str, status_code: int, duration_ms: float) -> None:
    key = (method.upper(), route, int(status_code))
    with _lock:
        bucket = _requests[key]
        bucket["count"] += 1
        bucket["total_ms"] += max(0.0, duration_ms)
        bucket["max_ms"] = max(bucket["max_ms"], duration_ms)


def metrics_snapshot() -> dict:
    with _lock:
        rows = []
        for (method, route, status_code), values in sorted(_requests.items()):
            count = int(values["count"])
            rows.append(
                {
                    "method": method,
                    "route": route,
                    "status": status_code,
                    "count": count,
                    "averageMs": round(values["total_ms"] / count, 2) if count else 0.0,
                    "maxMs": round(values["max_ms"], 2),
                }
            )
    return {"http": rows, "privacy": "No account IDs, prompts, messages, URLs, room codes, or email addresses are metric labels."}


def clear_metrics() -> None:
    with _lock:
        _requests.clear()
