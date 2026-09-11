# Overte conversational animations

21 unmodified VRMA conversions from [Hanami](https://github.com/Undi95/Hanami/tree/6787685c8d40e4e79bffbb0d389b478f32ef88d6/vrma), pinned to `6787685c8d40e4e79bffbb0d389b478f32ef88d6`. Original FBX animation names, source URLs, durations and SHA-256 digests are recorded in manifest.json. These selected files are listed under Overte in UPSTREAM-NOTICE.md and licensed under Apache-2.0 (LICENSE.txt).

Copyright (c) 2013-2019, High Fidelity, Inc.
Copyright (c) 2019-2021, Vircadia contributors.
Copyright (c) 2022-2026, Overte e.V.

Original source: https://github.com/overte-org/overte/tree/master/interface/resources/avatar/animations

The upstream conversion notice describes retargeting, trimming and resampling. Emora does not modify these binaries. At playback it masks root, leg, expression and gaze tracks; quiet reactions use torso/head only. Speaking clips also use arms and fingers. This keeps the standing avatar grounded and preserves its facial animation. Other assets mentioned in the upstream notice are not included here.

Reproduce: `python3 scripts/import_meet_vrma.py && python3 scripts/build_meet_vrma.py`.
