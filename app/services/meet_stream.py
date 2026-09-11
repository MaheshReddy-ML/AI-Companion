"""Turn-scoped streaming transport and conservative public sentence buffering."""
from __future__ import annotations
import asyncio
from concurrent.futures import TimeoutError as FutureTimeout
from contextvars import ContextVar
import re
import threading


class MeetStream:
    def __init__(self):
        self.loop = asyncio.get_running_loop()
        self.events: asyncio.Queue = asyncio.Queue(maxsize=12)
        self.cancelled = threading.Event()

    async def emit(self, event: str, **data):
        if not self.cancelled.is_set():
            await self.events.put({"event": event, **data})

    def emit_sync(self, event: str, **data):
        if self.cancelled.is_set():
            return
        pending = asyncio.run_coroutine_threadsafe(self.emit(event, **data), self.loop)
        while not self.cancelled.is_set():
            try:
                pending.result(timeout=0.1)
                return
            except FutureTimeout:
                continue
        pending.cancel()


current_meet_stream: ContextVar[MeetStream | None] = ContextVar("meet_stream", default=None)


class PublicSentences:
    """Hold incomplete words/tags; never stream structured output or private thought.

    Used only for no-thinking, non-tool generations. Structured replies fall back
    to the existing complete-reply validator; they are never spoken incrementally.
    """
    def __init__(self):
        self.buffer = ""
        self.started = False
        self.blocked = False
        self.in_thought = False

    def feed(self, delta: str, final=False) -> list[str]:
        if self.blocked:
            return []
        self.buffer += delta
        if not self.started:
            stripped = self.buffer.lstrip()
            if not stripped or (len(stripped) < 12 and not final):
                return []
            if "<think>".startswith(stripped):
                return []
            if stripped.startswith("<think>"):
                end = stripped.find("</think>")
                if end < 0:
                    return []
                self.buffer = stripped[end+8:].lstrip()
                return self.feed("", final)
            if stripped[0] in '{[`<' or stripped.lower().startswith(('analysis:', 'assistant:')):
                self.blocked = True
                return []
            self.started = True
        # Tags/structured fragments appearing later also stay out of live speech.
        if any(c in self.buffer for c in '<>{}`'):
            self.blocked = True
            return []
        sentences=[]
        while True:
            match = re.search(r'[.!?](?:["\u201d\u2019])?(?=\s)', self.buffer)
            if not match:
                break
            end = match.end()
            candidate = self.buffer[:end].strip()
            # Avoid decimal/initial/abbreviation fragments and excessively tiny chunks.
            if len(candidate) < 18 or re.search(r'\b(?:Mr|Mrs|Ms|Dr|Prof|e\.g|i\.e)\.$', candidate):
                later = re.search(r'[.!?](?=\s)', self.buffer[end:])
                if not later:
                    break
                end += later.end()
                candidate = self.buffer[:end].strip()
            sentences.append(candidate)
            self.buffer = self.buffer[end:].lstrip()
        if final and self.buffer.strip():
            sentences.append(self.buffer.strip()); self.buffer = ""
        return sentences
