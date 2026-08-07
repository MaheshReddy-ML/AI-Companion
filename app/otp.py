from __future__ import annotations

import hmac

from app.security import hash_password, verify_password


OTP_HASH_PREFIX = "otp_hash$"


def hash_otp(otp: str) -> str:
    return f"{OTP_HASH_PREFIX}{hash_password(otp.strip())}"


def verify_otp_hash(otp: str, stored_value: str | None) -> bool:
    if not stored_value:
        return False

    candidate = otp.strip()
    if stored_value.startswith(OTP_HASH_PREFIX):
        return verify_password(candidate, stored_value.removeprefix(OTP_HASH_PREFIX))

    return hmac.compare_digest(stored_value, candidate)
