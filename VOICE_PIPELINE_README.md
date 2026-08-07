# AI Companion Local Streaming Voice Pipeline

This project uses Qwen3-TTS CustomVoice through MLX-Audio as its primary local Apple Silicon runtime. The GPT response is first converted into a `CompanionBrain` object, then the speech middleware maps that emotional/behavioral metadata into stable companion voice, style instruction, speed, cadence, and pauses. Kokoro remains an automatic local fallback when MLX-Audio or the Qwen model cannot load.

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 scripts/tts_setup.py --warmup
```

The default `TTS_QWEN_MODEL` is the 6-bit MLX Qwen3 1.7B CustomVoice model, selected for the M-series unified-memory budget. It is downloaded locally on the first warm-up; no cloud API is used. On Apple Silicon, MLX is the primary acceleration path. Set `TTS_ENGINE=kokoro` only when intentionally forcing the lightweight fallback.

```bash
python3 scripts/benchmark_tts.py
```

If `espeak-ng` is missing, install it for Kokoro's English G2P support:

```bash
brew install espeak-ng
```

## Character Voice Profiles and Styles

- `Yuna` -> `af_heart` fallback / Qwen `Serena`: warm, gentle female voice.
- `Vivi` -> `af_bella` fallback / Qwen `Vivian`: bright, lively female voice.
- `Sakurada` -> `am_adam` fallback / Qwen `Aiden`: calm, clear male voice.
- `haru` -> `am_michael` fallback / Qwen `Ryan`: dynamic, friendly male voice.

The profile remains stable across conversations and is configured only in `VoiceManager.CHARACTER_VOICE_PROFILES`. The API resolves the active `character_id` server-side and returns `X-TTS-Voice-Id` and `X-Qwen-Speaker` response headers for runtime verification. Qwen CustomVoice supports the Serena and Vivian female presets for English synthesis as well as the Ryan and Aiden male presets; instruction control supplies the requested style: `calm`, `comforting`, `empathetic`, `excited`, `happy`, `sad`, `romantic`, or `professional`.

The pronunciation layer expands abbreviations, acronyms, numbers, ISO dates, currencies, and common AI/technical terms before neural synthesis. Add project-specific terms to `models/voices/pronunciations.json`; each entry may include a spoken form and an IPA/G2P audit value.

## Runtime Flow

```text
User
-> GPT
-> Companion Brain
-> Speech middleware
-> Kokoro voice profile
-> PCM stream or WAV response
-> frontend audio analyser
-> avatar lip sync and behavior
```

## API

List voices:

```bash
curl http://127.0.0.1:8000/api/voices/list
```

Generate speech:

```bash
curl -X POST http://127.0.0.1:8000/api/voices/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I hear you. Let us slow this down for a second.",
    "character_id": "Yuna",
    "voice_id": "af_heart",
    "stream": false,
    "speech": {
      "speed": 0.96,
      "pauseFrequency": 0.4,
      "vocalEnergy": 0.48,
      "emotionalIntensity": 0.6
    }
  }' --output reply.wav
```

For low-latency playback, send `"stream": true`; the route returns `audio/L16;rate=24000;channels=1` (signed little-endian PCM) while the model is generating. The browser schedules these chunks with Web Audio and aborts the fetch plus active sources immediately when the user interrupts. Existing callers that omit `stream` still receive a normal cached `audio/wav` response.

Long replies are split at sentence boundaries (and then safe word boundaries for unusually long sentences) before synthesis. That starts the first sentence as soon as it is available, keeps model work bounded, and avoids cutting a word in half.

The in-process queue is bounded by `TTS_QUEUE_MAX_PENDING` and works with `TTS_WORKER_COUNT`; this prevents large model jobs or slow clients from consuming unbounded memory.

## Speech Markup

The brain can generate lightweight speech markup:

- `<pause ms="220" />` inserts a conversational pause.
- `<emphasis>phrase</emphasis>` keeps the phrase clear for emphasis routing.
- `<reflection />` adds a small reflective lead-in.

The middleware parses markup before Kokoro generation and preserves natural pacing in plain text.

## Production Notes

- Run `python3 scripts/tts_setup.py --warmup` during deployment to download/warm the model and cache one sample per character.
- Run `python3 scripts/benchmark_tts.py` on the target Mac. It records model startup, first-synthesis and cache latency, peak process RSS, WAV health, pronunciation cases, and a repeatable listening rubric in `TTS_BENCHMARK.json`.
- Keep `kokoro`, `misaki[en]`, and `espeak-ng` available as the local fallback path; use `brew install espeak-ng` if it is missing.
- Keep voice IDs stable in saved character profiles so long-running conversations remain recognizable.
- The frontend sends the full `brain` and `speech` payload to `/api/voices/speak`; do not strip that metadata at proxies.
