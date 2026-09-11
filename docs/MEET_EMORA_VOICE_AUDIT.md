# Meet Emora voice and motion implementation — 8 September 2026

## Pipeline and changes

The original path waited for an entire chat response, used an energy threshold for microphone activity, and allowed stale chat/audio work to survive interruption. Meet Emora now keeps continuous browser recognition active, accumulates confirmed transcript segments, and postpones endpointing while interim words or speech activity remain. Confirmed text waits 850 ms (1800 ms for hesitation). Interim text is never silently promoted to a final turn.

A locally bundled Silero V5 classifier distinguishes speech from silence/noise. Model, ONNX runtime, worklet, licenses and version/checksum manifest are in `app/static/vendor/meet-vad`. The classifier reuses the capture stream and audio context. A sustained adaptive energy detector remains available if neural initialization fails. Recognition itself still uses Web Speech; it is not an on-device STT implementation.

`POST /api/chat/stream` sends NDJSON turn, sentence, completion, error and heartbeat events through the existing authenticated chat/persistence path. Local MLX now emits actual incremental tokens. A conservative public-sentence filter suppresses structured payloads and reasoning tags; thinking/tool-grounded paths retain buffered validation. Other provider adapters can still buffer. Queued speech consumes each sentence once, waits for its PCM playback to finish, and does not repeat the final response.

Request identities guard responses, transcript slots, errors and audio queues. Barge-in stops scheduled PCM, resolves pending playback, aborts requests, signals server cancellation and retains the new utterance. The server records cancellation before registration and rejects late results. MLX token iteration closes cooperatively between tokens; an already running native operation is not forcibly preempted. Completed, committed turns are not retroactively removed.

PCM uses a shared analyser for mouth amplitude. Timeout, empty-audio, failed-TTS, device-stop and page-exit paths release owned resources and leave readable text. Mobile controls have 44px targets and keep the composer above navigation. The exposed states are IDLE, LISTENING, USER_SPEAKING, PROCESSING and EMORA_SPEAKING.

## Avatar animation

All four bundled avatars are VRM 0 models with 54 humanoid bones, including arms, hands and fingers. Official three-vrm-animation 3.5.5 retargets VRMA 1.0 onto their normalized skeletons.

The library has **24 clips**: 12 original project-authored conversational motions and 12 Apache-2.0 Overte animations converted by Hanami. The imported binaries are pinned to revision `6787685c8d40e4e79bffbb0d389b478f32ef88d6`; their URLs, upstream FBX names, SHA-256 digests, masks and durations are recorded in the manifests. Full upstream notices and the Apache license accompany the files. See `app/static/animations/meet/PROVENANCE.md` and `overte/README.md`.

The gesture controller varies agreement, acknowledgement, explanation and thinking within contextual families. Inactive periods use restrained state-appropriate head/torso clips with long cooldowns. Speaking clips can animate arms and fingers. The playback mask excludes root translation, hips, legs, eyes and expressions. Procedural blink, gaze, facial expression and spring bones retain ownership.

Wave poses now bend the elbow on the correct axis and orient the palm visibly. Open palms, pointing and shrugging have restrained arm positions; the thinking gesture avoids the former awkward hand-to-face pose. The controller restores the underlying pose each frame, suppresses competing procedural arm gestures, and blends interrupted/replaced clips rather than snapping. Reduced motion disables the VRMA layer. Missing assets retain the procedural fallback.

Reproduce assets with:

```sh
python3 scripts/import_meet_vrma.py
python3 scripts/build_meet_vrma.py
```

## Normal chat scrolling

A shared semantic-layer style was changing the transcript to `position: relative`, so it grew behind the composer instead of scrolling. A route-specific rule preserves absolute positioning. Header/composer measurements now bound the transcript, including growing drafts and attachments. Messages do not flex-shrink, older rows remain fully opaque, and reading older messages survives incoming thinking/reply updates. Jump to latest restores following. Normal chat remains a conversation view.

## Verification and practical limits

The final Python suite passed 185 tests with one skipped. Automated checks cover cancellation ownership, incremental public sentences, final thought filtering, generator cleanup, transcript accumulation, stale responses, queued speech and interruption. Binary tests validate all 24 VRMA files, checksums, masks and quaternion values. Real browser rendering loads all 24 on each of the four avatars; wave, point, open palm, think, shrug and imported speaking/nodding poses have screenshot coverage.

The real Silero model was exercised with silence, seeded noise and synthesized speech: no speech starts for silence/noise, one start/end for the speech fixture. The local MLX smoke produced 52 incremental chunks; first public sentence arrived at 6.04 seconds including model startup, with completion at 6.76 seconds. This is one local measurement, not a production latency guarantee.

Browser voice fixtures exercise the real page at 320, 390 and 1280px: confirmed-only submission, TTS failure recovery, repeated PCM interruptions, model rendering, enabled input and navigation clearance. Chat fixtures exercise long history, reading-position preservation, jump to latest and composer growth at 390, 1280 and 2048px. Screenshots and JSON reports are in `tmp/meet-qa`.

```sh
EMORA_TEST_MONGO=1 venv/bin/python -m pytest -q
node scripts/test-meet-voice.cjs
NODE_PATH=/tmp/emora-meet-qa/node_modules node scripts/meet-ui-qa.cjs
NODE_PATH=/tmp/emora-meet-qa/node_modules node scripts/meet-vrma-qa.cjs
NODE_PATH=/tmp/emora-meet-qa/node_modules node scripts/meet-vad-qa.cjs
NODE_PATH=/tmp/emora-meet-qa/node_modules node scripts/chat-scroll-qa.cjs
```

Playwright is installed outside the repository; browser checks require Chrome and a local app on port 8000. API/STT/audio fixtures do not use a real user's account or microphone. Actual accent/quiet-speech accuracy, speaker echo rejection, physical mobile keyboards, and Safari permission/autoplay behavior still require human device acceptance. The implementation and synthetic checks do not establish those outcomes.
