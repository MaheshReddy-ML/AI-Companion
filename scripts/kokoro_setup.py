from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.voice_manager import VoiceManager


SAMPLE_TEXT = {
    "Yuna": "Hi, I am Yuna. I will keep my voice warm and steady.",
    "rose": "Hey, I am Vivi. Let's make this feel bright and curious.",
    "robert": "Hello, I am Sakurada. I will keep things calm and clear.",
    "haru": "Hey, I am haru. I will keep this relaxed and friendly.",
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify and warm Kokoro voices for the AI companion.")
    parser.add_argument("--warmup", action="store_true", help="Generate one cached WAV for each character voice.")
    args = parser.parse_args()

    manager = VoiceManager()
    voices = manager.list_voices()
    print("Companion voice profiles (Kokoro fallback):")
    for voice in voices:
        print(f"- {voice['id']}: {voice['description']}")

    if not args.warmup:
        print("\nRun with --warmup after installing Kokoro to pre-cache character voices.")
        return 0

    try:
        import kokoro  # noqa: F401
        import soundfile  # noqa: F401
    except Exception:
        print(
            "Kokoro is not installed. Run: python3 -m pip install 'kokoro>=0.9.4' soundfile 'misaki[en]'",
            file=sys.stderr,
        )
        return 1

    for companion_id, text in SAMPLE_TEXT.items():
        path = manager.generate_audio(text, companion_id=companion_id)
        print(f"{companion_id}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
