import asyncio
import threading
import pytest

from app.services import companion_chat
from app.services.inference_queue import InferenceQueue


def test_local_companion_reply_requires_no_api_key(monkeypatch):
    captured = {}

    def fake_generate(**kwargs):
        captured.update(kwargs)
        return '{"reply":"I am here with you.","brain":{"emotion":{"empathy":0.9}}}'

    monkeypatch.setattr(companion_chat.settings, "chat_mlx_model", "Qwen/test-mlx")
    monkeypatch.setattr(companion_chat.local_mlx_chat, "generate", fake_generate)

    reply, brain, model = asyncio.run(companion_chat.get_companion_reply("I feel anxious."))

    assert reply == "I am here with you."
    assert brain["emotion"]["empathy"] == 0.9
    assert model == "Qwen/test-mlx"
    assert captured["model_id"] == "Qwen/test-mlx"
    assert captured["enable_thinking"] is False
    assert "continuous conversation" in captured["messages"][0]["content"]


def test_local_companion_reply_removes_a_leading_sad_emoticon(monkeypatch):
    monkeypatch.setattr(
        companion_chat.local_mlx_chat,
        "generate",
        lambda **kwargs: '{"reply":":( You are so sweet!"}',
    )

    reply, _, _ = asyncio.run(companion_chat.get_companion_reply("hello"))

    assert reply == "You are so sweet!"


def test_local_companion_reply_removes_non_companion_claims(monkeypatch):
    monkeypatch.setattr(
        companion_chat.local_mlx_chat,
        "generate",
        lambda **kwargs: "I'm doing great, just chilling with some chill vibes. Want to grab a coffee or have a chat?",
    )

    reply, _, _ = asyncio.run(companion_chat.get_companion_reply("Hey"))

    assert reply == "I’m here and ready to talk. What’s on your mind?"


def test_local_companion_prompt_keeps_brain_schema_out_of_model_output(monkeypatch):
    captured = {}

    def fake_generate(**kwargs):
        captured.update(kwargs)
        return "I hear that your confidence has taken a hit."

    monkeypatch.setattr(companion_chat.local_mlx_chat, "generate", fake_generate)

    reply, brain, _ = asyncio.run(companion_chat.get_companion_reply("I feel low."))

    assert reply == "I hear that your confidence has taken a hit."
    assert brain == {}
    system_prompt = captured["messages"][0]["content"]
    assert "Do not output JSON" in system_prompt
    assert "Schema:" not in system_prompt


def test_local_chat_runtime_stats_do_not_expose_prompt_or_reply(monkeypatch):
    monkeypatch.setattr(companion_chat.local_mlx_chat, "generate", lambda **_: "A concise answer.")

    asyncio.run(companion_chat.get_companion_reply("private message"))
    stats = companion_chat.local_mlx_chat.runtime_stats()

    assert "private message" not in str(stats)
    assert "A concise answer." not in str(stats)


def test_thinking_mode_stays_fast_for_casual_turns_and_enables_for_complex_work(monkeypatch):
    monkeypatch.setattr(companion_chat.settings, "chat_mlx_enable_thinking", False)
    monkeypatch.setattr(companion_chat.settings, "chat_mlx_thinking_mode", "auto")

    assert companion_chat.should_enable_thinking("Hey, what's up?") is False
    assert companion_chat.should_enable_thinking("Explain backpropagation step by step and compare two optimization tradeoffs.") is True


def test_chat_queue_serves_priority_accounts_before_queued_standard_work():
    queue = InferenceQueue(workers=1, max_pending=4)
    started = threading.Event()
    release = threading.Event()
    order = []

    def blocking_first():
        started.set()
        release.wait(timeout=2)
        order.append("first")
        return "first"

    def record(value):
        order.append(value)
        return value

    async def scenario():
        first = asyncio.create_task(queue.submit(blocking_first))
        await asyncio.to_thread(started.wait, 1)
        standard = asyncio.create_task(queue.submit(lambda: record("standard")))
        priority = asyncio.create_task(queue.submit(lambda: record("priority"), priority=True))
        await asyncio.sleep(0.03)
        release.set()
        await asyncio.gather(first, standard, priority)

    asyncio.run(scenario())
    assert order == ["first", "priority", "standard"]


def test_chat_queue_prevents_one_account_from_filling_shared_capacity(monkeypatch):
    monkeypatch.setattr(companion_chat.settings, "chat_queue_wait_seconds", 0.03)
    queue = InferenceQueue(workers=1, max_pending=4)
    started = threading.Event()
    release = threading.Event()

    def blocking():
        started.set()
        release.wait(timeout=2)
        return "done"

    async def scenario():
        first = asyncio.create_task(queue.submit(blocking, requester_id="account-a", requester_limit=1))
        await asyncio.to_thread(started.wait, 1)
        with pytest.raises(RuntimeError, match="this account"):
            await queue.submit(lambda: "blocked", requester_id="account-a", requester_limit=1)
        other = asyncio.create_task(queue.submit(lambda: "other", requester_id="account-b", requester_limit=1))
        release.set()
        assert await first == "done"
        assert await other == "other"

    asyncio.run(scenario())
