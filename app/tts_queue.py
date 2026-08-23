"""Bounded, cancellable in-process TTS work queue.

The public functions deliberately preserve the previous adapter API.  Streaming
uses a small hand-off queue so model generation cannot build unbounded audio in
RAM when a browser is slower than the synthesizer.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
import threading
from typing import AsyncIterator

from app.config import settings
from app.voice_manager import get_manager


_executor = ThreadPoolExecutor(max_workers=max(1, settings.tts_worker_count), thread_name_prefix="emora-tts")
_pending = threading.BoundedSemaphore(max(1, settings.tts_queue_max_pending))
_standard_pending = threading.BoundedSemaphore(max(1, settings.tts_queue_max_pending - settings.tts_priority_reserved))
_user_slots: dict[tuple[str, int], threading.BoundedSemaphore] = {}
_user_slots_lock = threading.Lock()


def _user_semaphore(requester_id: str | None, limit: int) -> threading.BoundedSemaphore | None:
    if not requester_id:
        return None
    key = (requester_id, max(1, limit))
    with _user_slots_lock:
        return _user_slots.setdefault(key, threading.BoundedSemaphore(key[1]))


async def _acquire_slot(*, requester_id: str | None, requester_limit: int, priority: bool) -> list[threading.BoundedSemaphore]:
    acquired_slots: list[threading.BoundedSemaphore] = []
    requested = [_user_semaphore(requester_id, requester_limit)]
    if not priority:
        requested.append(_standard_pending)
    requested.append(_pending)
    for semaphore in (item for item in requested if item is not None):
        acquired = await asyncio.to_thread(semaphore.acquire, True, settings.tts_queue_wait_seconds)
        if not acquired:
            for held in reversed(acquired_slots):
                held.release()
            if semaphore is requested[0] and requester_id:
                raise RuntimeError("Too many speech requests are already active for this account. Please wait for one to finish.")
            raise RuntimeError("Speech capacity is full. Please try again in a moment.")
        acquired_slots.append(semaphore)
    return acquired_slots


def _release_slots(slots: list[threading.BoundedSemaphore]) -> None:
    for semaphore in reversed(slots):
        semaphore.release()


async def reserve_tts_capacity(*, requester_id: str | None, requester_limit: int, priority: bool) -> list[threading.BoundedSemaphore]:
    """Reserve queue capacity before an HTTP streaming response commits 200."""
    return await _acquire_slot(requester_id=requester_id, requester_limit=requester_limit, priority=priority)


async def generate_audio(**kwargs):
    requester_id = kwargs.pop("requester_id", None)
    requester_limit = int(kwargs.pop("requester_limit", 1))
    priority = bool(kwargs.pop("priority", False))
    slots = await _acquire_slot(requester_id=requester_id, requester_limit=requester_limit, priority=priority)
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(_executor, partial(get_manager().generate_audio, **kwargs))
    finally:
        _release_slots(slots)


async def stream_pcm(**kwargs) -> AsyncIterator[bytes]:
    """Yield PCM chunks while allowing client disconnects to stop future work."""
    reserved_slots = kwargs.pop("reserved_slots", None)
    requester_id = kwargs.pop("requester_id", None)
    requester_limit = int(kwargs.pop("requester_limit", 1))
    priority = bool(kwargs.pop("priority", False))
    slots = reserved_slots or await _acquire_slot(requester_id=requester_id, requester_limit=requester_limit, priority=priority)
    loop = asyncio.get_running_loop()
    chunks: asyncio.Queue[bytes | BaseException | None] = asyncio.Queue(maxsize=6)
    cancelled = threading.Event()

    def put(item: bytes | BaseException | None) -> bool:
        if cancelled.is_set():
            return False
        future = asyncio.run_coroutine_threadsafe(chunks.put(item), loop)
        try:
            future.result(timeout=5)
            return not cancelled.is_set()
        except Exception:
            cancelled.set()
            return False

    def produce() -> None:
        try:
            for chunk in get_manager().iter_pcm(cancel_event=cancelled, **kwargs):
                if cancelled.is_set() or not put(chunk):
                    break
        except BaseException as exc:
            put(exc)
        finally:
            put(None)

    worker = loop.run_in_executor(_executor, produce)
    try:
        while True:
            item = await chunks.get()
            if item is None:
                break
            if isinstance(item, BaseException):
                raise item
            yield item
    finally:
        cancelled.set()
        # Do not wait here: a cancelled browser request must return instantly.
        # Capacity is released only after the synthesizer has actually stopped,
        # preventing a disconnected client from overcommitting shared models.
        worker.add_done_callback(lambda _: _release_slots(slots))
