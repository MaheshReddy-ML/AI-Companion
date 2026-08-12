# Security and runtime audit

## Scope and decisions

This audit covers the local-first FastAPI application, its declared Python
dependencies, bundled VRM assets, and the MLX model-selection workflow. No new
runtime dependency was added for the companion upgrade.

| Area | Current decision | Rationale |
| --- | --- | --- |
| Text inference | `mlx-lm` on Apple Silicon | Uses Metal/MLX rather than CUDA-only infrastructure. |
| Chat weights | Qwen/MLX model IDs from the official Qwen account or MLX Community | Explicit model ID, Hugging Face cache, no executable binary download. |
| Voice | Qwen3-TTS MLX with Kokoro fallback | Local synthesis and bounded worker queue prevent a cloud or unbounded-work fallback. |
| Camera | Explicit browser opt-in, reduced frame at send time | Frame is analyzed in memory only; persistence stores only the coarse report. |
| Avatar assets | Repository-owned VRM assets with source/license notes | `app/static/images/companions/SOURCE.txt` records provenance. |
| Browser rendering | Existing Three.js/VRM import map | Kept to avoid a frontend framework/runtime migration. |

## Dependency health and install policy

- Use `../.venv/bin/python -m pip check` after dependency changes.
- Do not install unreviewed packages, browser extensions, binaries, or model
  loaders as part of application startup.
- Keep model IDs in `.env`, download through `mlx-lm`/Hugging Face only after
  confirming the publisher, license, size, and machine-memory impact.
- The project requirements retain bounded version ranges. Lock exact resolved
  versions in a project-specific environment before a production deployment.

### Shared environment finding

The shared `/Users/mahesh/Myprojects/.venv` currently reports unrelated
dependency conflicts (`mlflow`, TensorFlow, LangChain, PaddleX, and Numba
against its NumPy/protobuf versions). Emora's test suite passes in that
environment, but production should use a dedicated virtual environment to
avoid MLX upgrades destabilizing unrelated tools. This is an environment
isolation action, not a reason to downgrade Emora's MLX stack in place.

## Runtime and privacy checks

- Chat and vision models are lazy, process-cached, and generation is
  serialized to avoid duplicate model loads and unified-memory overcommit.
- The TTS queue bounds pending jobs and stops generation after a browser
  disconnect.
- Chat, attachments, and TTS routes require a bearer session; attachment
  uploads can fail closed through ClamAV when configured.
- Runtime metrics intentionally exclude prompts, messages, generated replies,
  camera frames, and account data.

## Reproducible verification

```bash
../.venv/bin/python -m pip check
../.venv/bin/python -m pytest -q
../.venv/bin/python -m compileall app scripts tests
node --check app/static/js/your-emora.js
node --check app/static/js/emora-avatar-stage.js
git diff --check
```

## Model benchmark protocol

Run candidates sequentially while the VRM room and voice path are also open.
Record the generated `CHAT_BENCHMARK*.json` report, then compare load latency,
warm response latency, RSS increase, response quality, and whether the active
browser remains responsive. Do not select a larger model solely because it
produces a stronger isolated response.

```bash
../.venv/bin/python scripts/benchmark_chat.py --model Qwen/Qwen3-1.7B-MLX-4bit
../.venv/bin/python scripts/benchmark_chat.py --model Qwen/Qwen3-4B-MLX-4bit
```
