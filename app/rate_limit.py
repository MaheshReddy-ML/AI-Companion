from __future__ import annotations

from collections import defaultdict, deque
from time import monotonic
from time import time
from typing import Callable

from fastapi import HTTPException, Request, status

from app.config import settings


_buckets: dict[str, deque[float]] = defaultdict(deque)
_redis_client = None
_redis_unavailable = False


def _get_redis_client():
    global _redis_client, _redis_unavailable
    if not settings.redis_url or _redis_unavailable:
        return None
    if _redis_client is None:
        try:
            from redis import Redis
            _redis_client = Redis.from_url(settings.redis_url, socket_connect_timeout=0.25, socket_timeout=0.25)
            _redis_client.ping()
        except Exception:
            _redis_unavailable = True
            return None
    return _redis_client


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(limit: int, window_seconds: int, scope: str) -> Callable[[Request], None]:
    def dependency(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return

        now = monotonic()
        key = f"{scope}:{_client_ip(request)}"
        redis_client = _get_redis_client()
        if redis_client is not None:
            now_epoch = time()
            redis_key = f"{settings.redis_rate_limit_prefix}:{key}"
            try:
                with redis_client.pipeline() as pipeline:
                    pipeline.zremrangebyscore(redis_key, 0, now_epoch - window_seconds)
                    pipeline.zcard(redis_key)
                    _, count = pipeline.execute()
                if count >= limit:
                    raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests. Try again shortly.", headers={"Retry-After": "1"})
                with redis_client.pipeline() as pipeline:
                    pipeline.zadd(redis_key, {f"{now_epoch}:{id(request)}": now_epoch})
                    pipeline.expire(redis_key, window_seconds)
                    pipeline.execute()
                return
            except HTTPException:
                raise
            except Exception:
                # A local limiter remains available if the optional Redis service is unavailable.
                pass
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

    return dependency


def clear_rate_limit_buckets() -> None:
    _buckets.clear()
