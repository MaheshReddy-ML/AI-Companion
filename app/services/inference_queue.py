"""A bounded priority queue for synchronous model inference.

Local MLX generation is intentionally single-worker: its model state is shared.
Concurrent HTTP requests wait here without consuming FastAPI's general-purpose
thread pool, and Complete/admin work is selected before queued standard work.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import Future
from functools import partial
from itertools import count
from queue import PriorityQueue
import threading
from typing import Any, Callable

from app.config import settings


class InferenceQueue:
    def __init__(self, workers: int, max_pending: int) -> None:
        self._accepting = True
        self._pending = threading.BoundedSemaphore(max(1, max_pending))
        self._queue: PriorityQueue[tuple[int, int, Future, Callable[[], Any], list[threading.BoundedSemaphore]]] = PriorityQueue()
        self._sequence = count()
        self._user_slots: dict[tuple[str, int], threading.BoundedSemaphore] = {}
        self._user_slots_lock = threading.Lock()
        for index in range(max(1, workers)):
            threading.Thread(target=self._worker, name=f"emora-chat-{index + 1}", daemon=True).start()

    def _worker(self) -> None:
        while True:
            _, _, future, operation, slots = self._queue.get()
            try:
                if future.set_running_or_notify_cancel():
                    try:
                        future.set_result(operation())
                    except BaseException as exc:
                        future.set_exception(exc)
            finally:
                for slot in reversed(slots):
                    slot.release()
                self._queue.task_done()

    def _user_semaphore(self, requester_id: str | None, requester_limit: int) -> threading.BoundedSemaphore | None:
        if not requester_id:
            return None
        key = (requester_id, max(1, requester_limit))
        with self._user_slots_lock:
            return self._user_slots.setdefault(key, threading.BoundedSemaphore(key[1]))

    async def submit(self, operation: Callable[[], Any], *, priority: bool = False, requester_id: str | None = None, requester_limit: int = 1) -> Any:
        if not self._accepting:
            raise RuntimeError("Companion generation is draining for a server restart. Please retry shortly.")
        slots: list[threading.BoundedSemaphore] = []
        user_slot = self._user_semaphore(requester_id, requester_limit)
        for slot, message in (
            (user_slot, "Too many companion requests are already active for this account. Please wait for one to finish."),
            (self._pending, "Companion capacity is full. Please try again in a moment."),
        ):
            if slot is None:
                continue
            acquired = await asyncio.to_thread(slot.acquire, True, settings.chat_queue_wait_seconds)
            if not acquired:
                for held in reversed(slots):
                    held.release()
                raise RuntimeError(message)
            slots.append(slot)
        future: Future = Future()
        self._queue.put((0 if priority else 1, next(self._sequence), future, operation, slots))
        return await asyncio.wrap_future(future)

    def begin_shutdown(self) -> None:
        """Stop admission while allowing already queued daemon work to finish."""
        self._accepting = False

    def runtime_stats(self) -> dict[str, int | bool]:
        return {"accepting": self._accepting, "queued": self._queue.qsize()}


chat_inference_queue = InferenceQueue(settings.chat_worker_count, settings.chat_queue_max_pending)


def begin_chat_queue_shutdown() -> None:
    chat_inference_queue.begin_shutdown()


async def run_chat_generation(function: Callable[..., Any], *, priority: bool = False, requester_id: str | None = None, requester_limit: int = 1, **kwargs) -> Any:
    return await chat_inference_queue.submit(
        partial(function, **kwargs), priority=priority, requester_id=requester_id, requester_limit=requester_limit
    )
