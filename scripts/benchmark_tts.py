"""Repeatable local benchmark for the configured production TTS engine.

It intentionally does not claim a subjective MOS score.  Audio quality and
pronunciation are recorded as reproducible health/regression checks, with a
small human listening rubric in the generated JSON report.
"""
from __future__ import annotations

import argparse
import json
import os
import resource
import sys
import time
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.voice_manager import VoiceManager


BENCHMARK_TEXT = "Emora uses an API on 2026-07-15. The M L X voice costs $12.50, and the Qwen three model sounds calm."


def rss_bytes() -> int:
    # macOS reports ru_maxrss in bytes; Linux reports KiB.
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return value if sys.platform == "darwin" else value * 1024


def wav_health(path: Path) -> dict:
    with wave.open(str(path), "rb") as audio:
        frames = audio.getnframes()
        rate = audio.getframerate()
        width = audio.getsampwidth()
    return {
        "validWav": frames > 0 and rate > 0,
        "durationSeconds": round(frames / rate, 3) if rate else 0,
        "sampleRate": rate,
        "sampleWidthBytes": width,
        "bytes": path.stat().st_size,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure Emora local TTS startup, cached latency, memory, and audio health.")
    parser.add_argument("--output", default="TTS_BENCHMARK.json", help="Path for the machine-readable benchmark report.")
    args = parser.parse_args()
    started = time.perf_counter()
    rss_before = rss_bytes()
    manager = VoiceManager()
    constructed_ms = (time.perf_counter() - started) * 1000

    first_started = time.perf_counter()
    output = manager.generate_audio(BENCHMARK_TEXT, companion_id="yuna", speech={"style": "professional"})
    first_ms = (time.perf_counter() - first_started) * 1000

    cached_started = time.perf_counter()
    cached = manager.generate_audio(BENCHMARK_TEXT, companion_id="yuna", speech={"style": "professional"})
    cached_ms = (time.perf_counter() - cached_started) * 1000
    report = {
        "engine": settings.tts_engine,
        "model": settings.tts_qwen_model,
        "sampleRate": settings.tts_sample_rate,
        "process": {"pid": os.getpid(), "peakRssBytes": rss_bytes(), "peakRssDeltaBytes": max(0, rss_bytes() - rss_before)},
        "timingMilliseconds": {"managerConstruction": round(constructed_ms, 1), "firstSynthesisIncludingModelLoad": round(first_ms, 1), "cachedSynthesis": round(cached_ms, 1)},
        "audioQualityHealth": wav_health(output),
        "pronunciationRegression": {"input": BENCHMARK_TEXT, "expects": ["Emora", "A P I", "July fifteenth", "twelve dollars and fifty cents", "M L X", "Qwen three"]},
        "humanListeningRubric": {"audioQuality": "Score 1-5 for naturalness, clipping, and audible artifacts.", "pronunciationQuality": "Score 1-5 by checking every item in pronunciationRegression.expects.", "emotionalStyle": "Score 1-5 for whether the requested style is recognizable without becoming theatrical."},
        "cacheHit": str(output) == str(cached),
    }
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
