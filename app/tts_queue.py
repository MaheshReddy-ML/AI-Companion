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


async def _acquire_slot() -> None:
    acquired = await asyncio.to_thread(_pending.acquire, True, 0.1)
    if not acquired:
        raise RuntimeError("Speech queue is full. Please try again in a moment.")


async def generate_audio(**kwargs):
    await _acquire_slot()
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(_executor, partial(get_manager().generate_audio, **kwargs))
    finally:
        _pending.release()


async def stream_pcm(**kwargs) -> AsyncIterator[bytes]:
    """Yield PCM chunks while allowing client disconnects to stop future work."""
    await _acquire_slot()
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
        _pending.release()
        # Do not wait here: a cancelled browser request must return instantly.
        worker.add_done_callback(lambda _: None)
