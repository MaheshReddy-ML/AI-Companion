import asyncio
import threading
import pytest

from app.services import companion_chat
from app.services.inference_queue import InferenceQueue
from app.services.web_search import SearchDecision, SearchOutcome, SearchSource


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


def test_qwen_web_tool_call_is_executed_and_result_is_injected(monkeypatch):
    calls = []

    def fake_generate(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            return '<tool_call>{"name":"web_search","arguments":{"query":"current USD INR exchange rate","recency":1}}</tool_call>'
        assert calls[-1]["messages"][-1]["role"] == "tool"
        assert "UNTRUSTED WEB REFERENCES" in calls[-1]["messages"][-1]["content"]
        return "I checked the latest information. One US dollar is about 84 rupees right now."

    class FakeTool:
        schema = {"name": "web_search", "description": "Search", "parameters": {"type": "object"}}

        async def execute(self, decision, **kwargs):
            assert decision.query == "USD INR current exchange rate"
            return SearchOutcome(True, (SearchSource(
                "Current rate", "https://example.com/rate", "example.com", "1 USD equals about 84 INR.", score=0.9
            ),))

    monkeypatch.setattr(companion_chat.local_mlx_chat, "generate", fake_generate)
    reply, _, _, outcome = asyncio.run(companion_chat.get_web_grounded_companion_reply(
        message="USD to INR?",
        decision=SearchDecision(True, "price", "USD INR current exchange rate", 1),
        search_tool=FakeTool(),
        hourly_limit=5,
        requester_id="account-a",
    ))

    assert outcome.ok is True
    assert reply.startswith("I checked")
    assert len(calls) == 2
    assert calls[0]["tools"][0]["function"]["name"] == "web_search"


def test_qwen_web_tool_loop_is_bounded(monkeypatch):
    model_calls = 0
    tool_calls = 0

    def repeated_tool_call(**kwargs):
        nonlocal model_calls
        model_calls += 1
        return '<tool_call>{"name":"web_search","arguments":{"query":"latest AI news"}}</tool_call>'

    class FakeTool:
        schema = {"name": "web_search", "description": "Search", "parameters": {"type": "object"}}

        async def execute(self, decision, **kwargs):
            nonlocal tool_calls
            tool_calls += 1
            return SearchOutcome(True, (SearchSource(
                "News", "https://example.com/news", "example.com", "A current report.", score=0.9
            ),))

    monkeypatch.setattr(companion_chat.local_mlx_chat, "generate", repeated_tool_call)
    monkeypatch.setattr(companion_chat.settings, "emora_web_search_max_tool_iterations", 3)
    reply, _, _, _ = asyncio.run(companion_chat.get_web_grounded_companion_reply(
        message="latest AI news",
        decision=SearchDecision(True, "current_information", "latest AI news", 1),
        search_tool=FakeTool(),
        hourly_limit=10,
    ))

    assert model_calls == 3
    assert tool_calls == 3
    assert "don't want to guess" in reply
