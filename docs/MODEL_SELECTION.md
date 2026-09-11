# Local chat model selection

## Decision

Emora now defaults to `Qwen/Qwen3-4B-MLX-4bit`.

The model was chosen for the 16 GB Apple Silicon target after a direct local
comparison with the former `Qwen/Qwen3-1.7B-MLX-4bit` configuration. It adds
headroom for a more coherent companion response without committing the room,
voice model, browser renderer, and operating system to the substantially
larger 8B model.

## Measured local results

| Model | First scenario | Warm scenario range | Peak process RSS | Outcome |
| --- | ---: | ---: | ---: | --- |
| Qwen3 1.7B 4-bit | 5.09 s | 0.20–0.75 s | 1.32 GB | Baseline; lower response quality ceiling. |
| Qwen3 4B MLX 4-bit | 454.02 s* | 0.32–1.01 s | 2.52 GB | Selected. |

\* The first 4B run included its one-time model download. It is not a warm
load-time estimate. The downloaded weights are cached locally for later runs.

The tests exercised casual, celebratory, explanatory/confusion, and goodbye
turns with Qwen thinking disabled. The companion’s automatic thinking mode
keeps ordinary turns direct and reserves private reasoning for complex prompts.

## Deliberately not selected

The 8B candidate was not adopted. Its incomplete evaluation download was
cancelled and moved to the system Trash; it is not part of the runtime or the
repository. On this machine, preserving responsive VRM rendering and local
Qwen3-TTS alongside chat is more important than adding the 8B memory load.

## Re-run protocol

```bash
../.venv/bin/python scripts/benchmark_chat.py --model Qwen/Qwen3-4B-MLX-4bit
../.venv/bin/python scripts/benchmark_tts.py --output /tmp/emora-tts-benchmark.json
```

Use the developer-only telemetry panel (`COMPANION_DEBUG=true` outside
production) during a real room session to assess chat request timing, first
audio timing, renderer statistics, and FPS together.
