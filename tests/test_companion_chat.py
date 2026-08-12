import asyncio

from app.services import companion_chat


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
