# Original Emora conversational VRMA clips

These 12 motion files are original keyframes authored for this project on
2026-09-05. No downloaded animation, motion capture, third-party avatar mesh,
or model texture is included. They do not inherit a third-party motion license.
This notice does not assign a new license to the repository or its existing avatars.

Source: `scripts/build_meet_vrma.py`. Run it to reproduce the files and SHA-256
manifest. Animations use VRMA 1.0 with a standard humanoid T-pose skeleton,
rotation channels only, 30 Hz samples and smooth entry/exit envelopes. The
controller limits them to upper-body bones and preserves facial/audio controls.

Clips: wave, explain, open_palm, point, shrug, think, nod, disagree, surprise,
excited, listen, acknowledge. These are authored gestures, not motion capture.

Reference specifications (format guidance, no third-party motion copied):
- https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm_animation-1.0
- https://github.com/pixiv/three-vrm/tree/v3.5.5/packages/three-vrm-animation

The existing MIT-licensed @pixiv/three-vrm runtime and its animation package are
loaded from version-pinned CDN URLs. Their license remains at:
https://github.com/pixiv/three-vrm/blob/v3.5.5/LICENSE

This notice covers only the twelve files named above in this directory.
The additional imported clips under `overte/` have separate Apache-2.0 licensing,
source revisions and redistribution notices in `overte/README.md`,
`overte/UPSTREAM-NOTICE.md` and `overte/LICENSE.txt`.
