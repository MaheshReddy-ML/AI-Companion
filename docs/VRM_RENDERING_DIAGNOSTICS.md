# VRM Rendering Diagnostics

## Original Quality Targets

- Preserve VRM/MToon material settings from the source model.
- Preserve source texture resolution, sRGB color textures, and non-color data maps.
- Avoid mesh or morph optimization that can change facial expressions or material grouping.
- Keep the character grounded with visible floor contact.
- Keep the entire companion—from feet to head—inside the current avatar viewport.

## Detected Quality Losses

- The loader used aggressive VRM utility optimization passes, including morph combination. That can reduce expression fidelity and make material debugging harder.
- Material handling applied generic roughness/metalness/environment overrides. That risks changing MToon/toon shader intent.
- Camera framing was fixed by viewport aspect only, so different VRMs could appear too low, distant, cropped, or disconnected.
- Ground alignment used the pre-transform bounds and a small manual offset, which can cause floating or foot penetration after scale/rotation.
- Lighting was present but not tuned for anime VRM separation: limited fill, low shadow map resolution, and no neutral environment reflection.
- Texture color/data map handling was implicit, leaving source fidelity dependent on browser/loader defaults.

## Fixes Applied

- Removed fidelity-risking mesh/morph combination during VRM preparation.
- Added explicit color-space handling:
  - sRGB for color/emissive/toon color textures.
  - NoColorSpace for normal/roughness/metalness/alpha/ao/bump maps.
- Added mipmapped linear filtering and anisotropy up to renderer maximum capped at 8.
- Preserved MToon/toon material parameters instead of replacing roughness or shading values.
- Switched to neutral tone mapping with exposure `1.0` to reduce color shifts from filmic grading.
- Added a PMREM `RoomEnvironment` for soft, neutral reflections without overpowering toon materials.
- Increased renderer pixel ratio cap to `2.5` and shadow map size to `2048`.
- Added fill, rim, and eye lights for character separation and facial readability.
- Implemented post-transform automatic ground alignment.
- Added contact shadow receiving plane plus a soft blob shadow for floor contact.
- Added smooth, full-body camera framing calculated from each grounded VRM's post-transform bounding box and hips root. Distance, FOV, target, and clip planes recompute on resize while preserving margins around the head and feet.
- Added lower-body relaxed stance bones so weight distribution and foot contact stay stable.
- Added runtime diagnostics via `avatarStage.getDiagnostics()` and console output on VRM load.

## Performance Impact

- Higher pixel ratio and 2048 shadows improve fidelity at moderate GPU cost.
- Skipping mesh/morph combination prioritizes source fidelity over draw-call optimization.
- Texture anisotropy improves angled texture clarity with small GPU cost.
- The camera and pose springs are lightweight CPU-side updates.

## Runtime Diagnostic Output

On each VRM load, the stage logs:

- renderer color/tone/shadow settings
- max texture size and anisotropy
- mesh, skinned mesh, and material counts
- detected texture resolutions
- model scale and ground alignment metrics
- applied quality fixes
