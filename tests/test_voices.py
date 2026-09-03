import asyncio
import threading
from pathlib import Path

import numpy as np
from bson import ObjectId

from app.routers import voices
from app.tts_text import PronunciationPreprocessor
from app.voice_manager import VoiceManager


class FakeRequest:
    async def is_disconnected(self):
        return False


def voice_user(plan="plus"):
    return {"_id": ObjectId(), "email": "voice@example.com", "subscription": {"plan": plan, "status": "active"}}


def test_speak_passes_text_to_tts_queue_as_a_keyword(monkeypatch, tmp_path):
    received = {}
    output = tmp_path / "reply.wav"
    output.write_bytes(b"RIFF")

    async def fake_generate_audio(**kwargs):
        received.update(kwargs)
        return output

    monkeypatch.setattr(voices, "generate_audio", fake_generate_audio)

    response = asyncio.run(
        voices.speak(
            # A stale or malicious browser voice must not override Yuna's profile.
            voices.SpeakRequest(text="Hello from Emora", character_id="Yuna", voice_id="am_adam"),
            FakeRequest(),
            voice_user(),
        )
    )

    assert received["text"] == "Hello from Emora"
    assert received["companion_id"] == "Yuna"
    assert received["voice_id"] == "af_heart"
    assert response.headers["x-qwen-speaker"] == "Serena"
    assert response.path == output


def test_streaming_speak_returns_pcm_without_waiting_for_a_wav(monkeypatch):
    received = {}

    async def fake_stream_pcm(**kwargs):
        received.update(kwargs)
        yield b"\x00\x00\x01\x00"

    monkeypatch.setattr(voices, "stream_pcm", fake_stream_pcm)
    async def fake_reserve_tts_capacity(**kwargs):
        return []
    monkeypatch.setattr(voices, "reserve_tts_capacity", fake_reserve_tts_capacity)
    response = asyncio.run(
        voices.speak(
            voices.SpeakRequest(text="Hello from Emora", character_id="Yuna", voice_id="af_heart", stream=True),
            FakeRequest(),
            voice_user(),
        )
    )

    async def read_body():
        return b"".join([chunk async for chunk in response.body_iterator])

    assert response.media_type.startswith("audio/L16")
    assert asyncio.run(read_body()) == b"\x00\x00\x01\x00"
    assert received["text"] == "Hello from Emora"


def test_pronunciation_preprocessor_expands_product_terms_dates_and_currency(tmp_path):
    dictionary = tmp_path / "pronunciations.json"
    dictionary.write_text('{"Emora": {"spoken": "eh mora", "phonemes": "ɛˈmɔɹə"}}', encoding="utf-8")

    prepared = PronunciationPreprocessor(dictionary).prepare("Emora uses an API on 2026-07-15 and costs $12.50.")

    assert "eh mora" in prepared.text
    assert "A P I" in prepared.text
    assert "July fifteenth, two thousand twenty-six" in prepared.text
    assert "twelve dollars and fifty cents" in prepared.text
    assert ("Emora", "ɛˈmɔɹə") in prepared.g2p_substitutions


def test_sentence_chunking_keeps_boundaries_and_limits_long_text(tmp_path):
    manager = VoiceManager(models_dir=tmp_path / "models", cache_dir=tmp_path / "cache")

    chunks = manager._sentence_chunks("First sentence. Second sentence! " + "word " * 100, maximum_characters=80)

    assert chunks[:2] == ["First sentence.", "Second sentence!"]
    assert all(len(chunk) <= 80 for chunk in chunks)


def test_character_voice_registry_assigns_gender_correct_qwen_speakers(tmp_path):
    manager = VoiceManager(models_dir=tmp_path / "models", cache_dir=tmp_path / "cache")

    assert manager.get_voice_assignment("Yuna") == {"voice_id": "af_heart", "gender": "female", "qwen_speaker": "Serena"}
    assert manager.get_voice_assignment("rose") == {"voice_id": "af_bella", "gender": "female", "qwen_speaker": "Vivian"}
    assert manager.get_voice_assignment("robert") == {"voice_id": "am_adam", "gender": "male", "qwen_speaker": "Aiden"}
    assert manager.get_voice_assignment("haru") == {"voice_id": "am_michael", "gender": "male", "qwen_speaker": "Ryan"}


def test_qwen_inference_receives_the_configured_character_speaker(monkeypatch, tmp_path):
    manager = VoiceManager(models_dir=tmp_path / "models", cache_dir=tmp_path / "cache")
    received = {}

    class FakeResult:
        audio = np.zeros(32, dtype=np.float32)

    class FakeQwenModel:
        def get_supported_speakers(self):
            return ["Serena", "Vivian", "Ryan", "Aiden"]

        def generate_custom_voice(self, **kwargs):
            received.update(kwargs)
            yield FakeResult()

    monkeypatch.setattr(manager, "_qwen_model", lambda: FakeQwenModel())
    profile = manager._build_speech_profile(voice_id="am_adam", companion_id="Yuna", speech=None, brain=None)

    chunks = list(manager._iter_qwen_audio("Hello from Yuna.", manager.find_voice("af_heart"), profile, threading.Event()))

    assert chunks
    assert profile["qwen_speaker"] == "Serena"
    assert received["speaker"] == "Serena"
    assert received["language"] == "English"
    assert received["stream"] is True


def test_torch_qwen_tts_uses_native_batch_result_without_mlx_stream_options(monkeypatch, tmp_path):
    manager = VoiceManager(models_dir=tmp_path / "models", cache_dir=tmp_path / "cache")
    received = {}

    class FakeTorchQwenModel:
        def get_supported_speakers(self):
            return ["Serena"]

        def generate_custom_voice(self, **kwargs):
            received.update(kwargs)
            return [np.zeros(32, dtype=np.float32)], 24000

    def fake_model():
        manager._active_qwen_backend_kind = "torch"
        return FakeTorchQwenModel()

    monkeypatch.setattr(manager, "_qwen_model", fake_model)
    profile = manager._build_speech_profile(None, "Yuna", None, None)
    chunks = list(manager._iter_qwen_audio("Hello.", manager.find_voice("af_heart"), profile, threading.Event()))

    assert len(chunks) == 1
    assert "stream" not in received
    assert received["speaker"] == "Serena"


def test_qwen_voice_runtime_serializes_concurrent_users(monkeypatch, tmp_path):
    manager = VoiceManager(models_dir=tmp_path / "models", cache_dir=tmp_path / "cache")
    active = 0
    maximum_active = 0
    state_lock = threading.Lock()

    class FakeResult:
        audio = np.zeros(16, dtype=np.float32)

    class FakeQwenModel:
        def get_supported_speakers(self):
            return ["Serena"]

        def generate_custom_voice(self, **kwargs):
            nonlocal active, maximum_active
            with state_lock:
                active += 1
                maximum_active = max(maximum_active, active)
            try:
                threading.Event().wait(0.04)
                yield FakeResult()
            finally:
                with state_lock:
                    active -= 1

    monkeypatch.setattr(manager, "_qwen_model", lambda: FakeQwenModel())
    profile = manager._build_speech_profile(None, "Yuna", None, None)
    voice = manager.find_voice("af_heart")
    workers = [threading.Thread(target=lambda: list(manager._iter_qwen_audio("Hello.", voice, profile, threading.Event()))) for _ in range(3)]
    for worker in workers: worker.start()
    for worker in workers: worker.join()

    assert maximum_active == 1
