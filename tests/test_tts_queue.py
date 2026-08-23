import asyncio
import threading

import pytest

from app import tts_queue


def test_tts_queue_isolates_accounts_and_limits_one_account(monkeypatch):
    started = threading.Event()
    release = threading.Event()

    class FakeManager:
        def generate_audio(self, **kwargs):
            started.set()
            release.wait(timeout=2)
            return kwargs["text"]

    monkeypatch.setattr(tts_queue, "get_manager", lambda: FakeManager())
    monkeypatch.setattr(tts_queue.settings, "tts_queue_wait_seconds", 0.03)

    async def scenario():
        first = asyncio.create_task(tts_queue.generate_audio(text="first", requester_id="account-a", requester_limit=1))
        await asyncio.to_thread(started.wait, 1)
        with pytest.raises(RuntimeError, match="this account"):
            await tts_queue.generate_audio(text="blocked", requester_id="account-a", requester_limit=1)

        other = asyncio.create_task(tts_queue.generate_audio(text="other", requester_id="account-b", requester_limit=1))
        release.set()
        assert await first == "first"
        assert await other == "other"

    asyncio.run(scenario())
