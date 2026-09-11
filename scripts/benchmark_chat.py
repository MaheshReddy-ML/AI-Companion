"""Repeatable local MLX chat benchmark for model-selection decisions.

The script measures actual model-load and response latency on the current Mac.
It uses the configured model by default and only downloads a model when the
caller explicitly selects one that is not already present in the HF cache.
"""
from __future__ import annotations

import argparse
import json
import resource
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.companion_brain import build_companion_brain
from app.config import settings
from app.services.local_mlx_chat import LocalMLXChatProvider


SCENARIOS = [
    ("casual", "Hey, what's up?"),
    ("celebration", "I finally passed my exam!"),
    ("confusion", "I don't understand backpropagation. Can you explain it simply?"),
    ("goodbye", "Good night, see you tomorrow."),
]


def rss_bytes() -> int:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return value if sys.platform == "darwin" else value * 1024


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark one local MLX chat model with companion scenarios.")
    parser.add_argument("--model", default=settings.chat_mlx_model, help="MLX model id to measure.")
    parser.add_argument("--output", default="CHAT_BENCHMARK.json", help="Machine-readable report path.")
    parser.add_argument("--max-tokens", type=int, default=180, help="Maximum generated tokens per scenario.")
    args = parser.parse_args()

    provider = LocalMLXChatProvider()
    baseline_rss = rss_bytes()
    results: list[dict] = []
    for name, message in SCENARIOS:
        started = time.perf_counter()
        reply = provider.generate(
            model_id=args.model,
            messages=[
                {"role": "system", "content": "Reply naturally and concisely. Do not reveal reasoning."},
                {"role": "user", "content": message},
            ],
            max_tokens=args.max_tokens,
            temperature=settings.chat_mlx_temperature,
            enable_thinking=False,
        )
        elapsed_ms = (time.perf_counter() - started) * 1000
        brain = build_companion_brain(reply=reply, raw_brain=None, message=message, history=[], character_name="Yuna")
        output_words = len(reply.split())
        results.append(
            {
                "scenario": name,
                "input": message,
                "reply": reply,
                "latencyMs": round(elapsed_ms, 1),
                # This is intentionally words/sec, not model tokens/sec. MLX-LM
                # does not expose tokenizer timings through this API version.
                "visibleWordsPerSecond": round(output_words / max(elapsed_ms / 1000, 0.001), 2),
                "behavior": {"emotion": brain["emotion"].get("label"), "attention": brain["behavior"].get("attentionState")},
            }
        )

    report = {
        "model": args.model,
        "thinkingEnabled": False,
        "maxTokens": args.max_tokens,
        "process": {"peakRssBytes": rss_bytes(), "peakRssDeltaBytes": max(0, rss_bytes() - baseline_rss)},
        "scenarios": results,
        "notes": [
            "The first scenario includes model load time; later scenarios measure warm in-process performance.",
            "Visible words/sec is a user-facing throughput proxy, not tokenizer-level tokens/sec.",
            "Evaluate quality and VRM/TTS responsiveness alongside this report before changing CHAT_MLX_MODEL.",
        ],
    }
    Path(args.output).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
