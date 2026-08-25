from __future__ import annotations

import json
import hashlib
import logging
from contextvars import ContextVar, Token
from datetime import datetime, timezone
from typing import Any


logger = logging.getLogger("app.audit")
_request_id: ContextVar[str | None] = ContextVar("emora_request_id", default=None)


def set_request_id(value: str) -> Token:
    return _request_id.set(value)


def reset_request_id(token: Token) -> None:
    _request_id.reset(token)


def _safe_value(key: str, value: Any) -> Any:
    if key.lower() in {"email", "recipient"}:
        digest = hashlib.sha256(str(value).strip().casefold().encode()).hexdigest()[:16]
        return f"sha256:{digest}"
    if key.endswith("_id"):
        return str(value)
    return value


def audit_event(event: str, **fields: Any) -> None:
    safe_fields = {
        key: _safe_value(key, value)
        for key, value in fields.items()
        if value is not None
    }
    logger.info(
        json.dumps(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event": event,
                "request_id": _request_id.get(),
                **safe_fields,
            },
            sort_keys=True,
            default=str,
        )
    )
