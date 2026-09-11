# VRMA motion refinement — 11 September 2026

## Changes

The library now contains 33 VRMA 1.0 clips: 12 project-authored motions and 21 Apache-2.0 Overte conversions from Hanami. Nine additions provide standing/head variations, left/right-hand speaking takes, a longer explanation take, fidgeting, looking left/right and a head shake. Source revision `6787685c8d40e4e79bffbb0d389b478f32ef88d6` remains pinned. The imported binaries are unmodified, with source FBX names, source URLs, checksums and license notices under `app/static/animations/meet/overte/`. Total library size is 6,237,944 bytes.

Source and redistribution terms: https://github.com/Undi95/Hanami/blob/6787685c8d40e4e79bffbb0d389b478f32ef88d6/vrma/NOTICE.md

Standing previously combined roughly 0.2 radians of upper-arm X rotation with 0.43 radians of forearm X rotation, presenting flat palms toward the camera. Resting forearm twist is now 0.03 radians, upper-arm X rotation 0.08, with restrained elbow flexion and a gentle graduated finger curl. Initial pose, procedural resting targets and authored VRMA neutral keys agree. No avatar mesh, skinning, texture or VRM file changed.

Playback now bounds long imported takes to six-second excerpts, or the requested gesture duration, using entry/exit fades instead of drastically accelerating the animation. Playback-rate adjustment is limited to 0.85–1.15. Ambient clips yield to contextual gestures and fade when the conversation state changes. Forced replacements preserve the displayed pose at the transition boundary. The existing barge-in/stop path remains in charge of interrupting motion.

VRMA advances with actual frame elapsed time, independently of the capped physics integration step. This prevents motion duration stretching below 30 FPS. Root/leg motion, facial expressions, gaze, audio-driven mouth movement and spring physics retain their existing owners. Reduced motion still disables VRMA playback. Cache versions were updated for the Meet page/module chain.

## Verification

- All 33 binaries pass quaternion, mask, format and checksum checks.
- Full Python suite: 238 passed, 4 skipped (one existing TestClient deprecation warning).
- Voice fixtures pass endpointing, transcript accumulation, stale reply handling, cancellation and playback interruption.
- Chrome rendering loads all 33 clips on Yuna, haru, Vivi and Sakurada without page errors. Standing and conversational poses were rendered and inspected. Screenshots and runtime report: `tmp/meet-qa/vrma-*.png`, `tmp/meet-qa/vrma-report.json`.
- Browser controller checks cover bounded duration, ambient preemption, interruption fade, elapsed-time completion, replacement continuity and reduced motion.
- Original VRM file SHA-256 hashes match the pre-change snapshot. JavaScript syntax and `git diff --check` pass.

Reproduce:

```sh
python3 scripts/import_meet_vrma.py
python3 scripts/build_meet_vrma.py
../.venv/bin/python -m pytest -q
node scripts/test-meet-voice.cjs
NODE_PATH=/tmp/emora-ui-qa/node_modules node scripts/meet-vrma-qa.cjs
```

Browser QA requires the local app at port 8000 and Chrome. These are rendered and simulated-timing checks, not proof of perfect anatomical contact or phoneme-level gesture synchronization. Physical microphone/speaker latency and device-specific playback still require live device testing. The imported motions are human-authored animation, not newly captured human movement.
