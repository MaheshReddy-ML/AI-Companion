from __future__ import annotations

import json
import logging
from typing import Any


logger = logging.getLogger("app.audit")


def audit_event(event: str, **fields: Any) -> None:
    safe_fields = {
        key: str(value) if key.endswith("_id") else value
        for key, value in fields.items()
        if value is not None
    }
    logger.info(json.dumps({"event": event, **safe_fields}, sort_keys=True, default=str))
