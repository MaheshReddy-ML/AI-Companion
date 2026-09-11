from __future__ import annotations

from collections import defaultdict, deque
import hashlib
from secrets import token_hex
from threading import Lock
from time import monotonic
from time import time
from typing import Callable

from fastapi import HTTPException, Request, status

from app.config import settings
from app.http_security import client_ip


_buckets: dict[str, deque[float]] = defaultdict(deque)
_redis_client = None
_redis_retry_after = 0.0
_bucket_lock = Lock()
_last_bucket_cleanup = 0.0

_REDIS_RATE_LIMIT_SCRIPT = """
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - ARGV[2])
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry = 1
  if oldest[2] then retry = math.max(1, math.ceil(tonumber(ARGV[2]) - (tonumber(ARGV[1]) - tonumber(oldest[2])))) end
  return {0, count, retry}
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
redis.call('EXPIRE', KEYS[1], math.ceil(tonumber(ARGV[2])))
return {1, count + 1, 0}
"""


def _get_redis_client():
    global _redis_client, _redis_retry_after
    if not settings.redis_url or monotonic() < _redis_retry_after:
        return None
    if _redis_client is None:
        try:
            from redis import Redis
            _redis_client = Redis.from_url(settings.redis_url, socket_connect_timeout=0.25, socket_timeout=0.25)
            _redis_client.ping()
        except Exception:
            _redis_client = None
            _redis_retry_after = monotonic() + 5
            return None
    return _redis_client


def rate_limit_backend_status() -> dict:
    if not settings.redis_url:
        return {"required": False, "ok": True, "backend": "in-memory"}
    client = _get_redis_client()
    return {"required": True, "ok": client is not None, "backend": "redis"}


def _client_ip(request: Request) -> str:
    return client_ip(request)


def _client_identity(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        # Separate authenticated accounts sharing one household, campus, or
        # office IP without retaining the bearer token itself in limiter keys.
        digest = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()[:24]
        return f"session:{digest}"
    return f"ip:{_client_ip(request)}"


def rate_limit(limit: int, window_seconds: int, scope: str) -> Callable[[Request], None]:
    def dependency(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return

        now = monotonic()
        key = f"{scope}:{_client_identity(request)}"
        redis_client = _get_redis_client()
        if redis_client is not None:
            now_epoch = time()
            redis_key = f"{settings.redis_rate_limit_prefix}:{key}"
            try:
                allowed, _, retry_after = redis_client.eval(
                    _REDIS_RATE_LIMIT_SCRIPT,
                    1,
                    redis_key,
                    now_epoch,
                    window_seconds,
                    limit,
                    f"{now_epoch}:{token_hex(8)}",
                )
                if not allowed:
                    retry_after = max(1, int(retry_after))
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Too many requests. Try again in {retry_after} seconds.",
                        headers={"Retry-After": str(retry_after)},
                    )
                return
            except HTTPException:
                raise
            except Exception:
                # A local limiter remains available if the optional Redis service is unavailable.
                pass
        global _last_bucket_cleanup
        with _bucket_lock:
            bucket = _buckets[key]
            while bucket and now - bucket[0] > window_seconds:
                bucket.popleft()

            if len(bucket) >= limit:
                retry_after = max(1, int(window_seconds - (now - bucket[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many requests. Try again in {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)},
                )

            bucket.append(now)
            if now - _last_bucket_cleanup >= 300:
                empty_keys = [bucket_key for bucket_key, values in _buckets.items() if not values or now - values[-1] > 3600]
                for bucket_key in empty_keys:
                    _buckets.pop(bucket_key, None)
                _last_bucket_cleanup = now

    return dependency


def clear_rate_limit_buckets() -> None:
    global _last_bucket_cleanup
    with _bucket_lock:
        _buckets.clear()
        _last_bucket_cleanup = 0.0
