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
    assert "emotionally supportive AI companion" in captured["messages"][0]["content"]
