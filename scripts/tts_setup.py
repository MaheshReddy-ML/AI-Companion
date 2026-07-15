"""Install-time validation and model warm-up for Emora's local TTS runtime."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.voice_manager import VoiceManager


SAMPLES = {
    "yuna": "Hello. I am here with you, and we can take this one gentle step at a time.",
    "rose": "That is wonderful news! I am genuinely excited for you.",
    "robert": "Here is a clear, professional summary of the next step.",
    "haru": "Hey, I am glad you are here. Let us keep this simple.",
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate and warm Emora's local Qwen3/Kokoro speech runtime.")
    parser.add_argument("--warmup", action="store_true", help="Download/load the configured model and cache one response per companion.")
    args = parser.parse_args()
    print(f"Configured engine: {settings.tts_engine}")
    print(f"Configured model: {settings.tts_qwen_model}")
    print(f"Streaming sample rate: {settings.tts_sample_rate} Hz")
    if not args.warmup:
        print("Run with --warmup after installing requirements to load the model and validate local synthesis.")
        return 0

    manager = VoiceManager()
    for companion_id, text in SAMPLES.items():
        path = manager.generate_audio(text, companion_id=companion_id, speech={"style": "calm"})
        print(f"{companion_id}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
