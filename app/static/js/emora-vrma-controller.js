import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ALIASES = {
  greeting: "wave", goodbye: "wave", waving: "wave", explanation: "explain",
  pointing: "point", emphasize: "point", emphasis: "point", shrugging: "shrug",
  shy: "think", thinking: "think", nodding: "nod", agreeing: "nod", agreement: "nod",
  disagreeing: "disagree", thumbs_down: "disagree", thumbs_up: "nod",
  surprise: "surprise", cheer: "excited", celebration: "excited", excitement: "excited",
  sparkle: "excited", happiness: "excited", listening: "listen", waiting: "listen",
  idleShift: "listen", acknowledgment: "acknowledge", heart: "open_palm", concern: "open_palm",
};
const ALLOWED_BONE = /^(?:head|neck|spine|chest|upperChest|(?:left|right)(?:Shoulder|UpperArm|LowerArm|Hand|(?:Thumb|Index|Middle|Ring|Little)(?:Metacarpal|Proximal|Intermediate|Distal)))$/;
const ease = x => { const v = THREE.MathUtils.clamp(x, 0, 1); return v * v * (3 - 2 * v); };

// Rotation-only upper-body layer. The base rig owns posture; this layer samples
// retargeted VRMA tracks afterwards. No expression, gaze, scale or root tracks
// can claim ownership, even if a future imported file includes those channels.
export async function createVRMAGestureController({ reducedMotion = false } = {}) {
  const { VRMAnimationLoaderPlugin, createVRMAnimationHumanoidTracks } = await import("@pixiv/three-vrm-animation");
  const loader = new GLTFLoader();
  loader.register(parser => new VRMAnimationLoaderPlugin(parser));
  const response = await fetch("/static/animations/meet/manifest.json?v=20260911-motion2");
  if (!response.ok) throw new Error("Gesture manifest is unavailable.");
  const manifest = await response.json();
  const animations = new Map();
  const failures = [];
  await Promise.all(Object.entries(manifest.clips).map(async ([name, entry]) => {
    try {
      if (!entry.url.startsWith("/static/animations/meet/")) throw new Error("Untrusted gesture path.");
      const gltf = await loader.loadAsync(`${entry.url}?v=${entry.sha256}`);
      const animation = gltf.userData.vrmAnimations?.[0];
      if (!animation || !Number.isFinite(animation.duration) || animation.duration <= 0) throw new Error("Invalid VRMA duration.");
      animations.set(name, { animation, mask: new Set(entry.bones.filter(bone => ALLOWED_BONE.test(bone))) });
    } catch (error) { failures.push(name); console.warn(`Gesture ${name} unavailable; procedural fallback remains active.`, error); }
  }));
  let clips = new Map();
  let active = null;
  let transition = null;
  let elapsed = 0;
  let lastStart = -Infinity;
  let lastName = "";
  let disposed = false;
  let nextAmbient = 12;
  let ambientIndex = 0;
  let contextName = "idle";
  const variations = new Map();
  const families = {
    nod: ["nod", "overte-nod", "overte-nod-3", "overte-nod-4"],
    acknowledge: ["acknowledge", "overte-nod-2", "overte-nod-5"],
    explain: ["explain", "overte-idle-talking", "overte-idle-talking-4", "overte-idle-talking-6", "overte-idle-talking-7", "overte-idle-talking-5"],
    disagree: ["disagree", "overte-angry-2", "overte-shake"],
    think: ["think", "overte-think", "overte-neutral", "overte-think-2"],
  };
  const basePose = new Map();
  const target = new THREE.Quaternion();
  function restoreBase() {
    for (const [node, rotation] of basePose) node.quaternion.copy(rotation);
    basePose.clear();
  }
  const api = {
    attach(vrm) {
      restoreBase(); active = null; transition = null; clips.clear();
      if (disposed || !vrm) return;
      for (const [name, { animation, mask }] of animations) {
        const rotations = createVRMAnimationHumanoidTracks(animation, vrm.humanoid, vrm.meta.metaVersion).rotation;
        const tracks = [];
        for (const [bone, track] of rotations) {
          const node = vrm.humanoid.getNormalizedBoneNode(bone);
          if (node && mask.has(bone)) tracks.push({ bone, node, interpolant: track.createInterpolant(), base: new THREE.Quaternion() });
        }
        if (tracks.length) clips.set(name, { duration: animation.duration, tracks });
      }
      lastStart = -Infinity; lastName = ""; variations.clear(); nextAmbient = elapsed + 12;
    },
    play(intent, { intensity = 0.7, force = false, duration, ambient = false } = {}) {
      if (disposed || reducedMotion) return false;
      const family = ALIASES[intent] || intent;
      const choices = families[family]?.filter(name => clips.has(name));
      const index = variations.get(family) || 0;
      const name = choices?.length ? choices[index % choices.length] : family;
      const clip = clips.get(name);
      if (!clip || (!force && (elapsed - lastStart < 1.1 || (lastName === name && elapsed - lastStart < 4.5)))) return false;
      // Avoid replacing a pose mid-gesture. Interruption explicitly uses stop().
      if (active && !force && !active.ambient) return false;
      if (active) {
        transition = { started: elapsed, poses: new Map([...basePose.keys()].map(node => [node, { shown: node.quaternion.clone(), base: new THREE.Quaternion() }])) };
      }
      const rate = duration ? THREE.MathUtils.clamp(clip.duration / duration, 0.85, 1.15) : 1;
      // Long motion-library takes are sampled at a natural speed, never rushed
      // into a short speech cue. Fade the excerpt back into the resting pose.
      const playDuration = Math.min(clip.duration / rate, duration ? Math.max(1.4, duration) : 6);
      active = { name, clip, rate, duration: playDuration, ambient, started: elapsed, weight: THREE.MathUtils.clamp(intensity, 0.2, 1), stopAt: null, stopWeight: 1 };
      lastStart = elapsed; lastName = name;
      variations.set(family, index + 1);
      nextAmbient = elapsed + playDuration + 7;
      return true;
    },
    stop(fadeSeconds = 0.14) {
      if (!active || active.stopAt !== null) return;
      active.stopAt = elapsed; active.fade = Math.max(0.02, fadeSeconds);
    },
    // Called before the procedural rig so unowned fingers cannot accumulate.
    beginFrame() { restoreBase(); },
    update(delta, context = {}) {
      elapsed += delta;
      const nextContext = context.speaking ? "speaking" : context.listening ? "listening" : context.thinking ? "thinking" : "idle";
      if (nextContext !== contextName) {
        if (active?.ambient) api.stop(0.25);
        contextName = nextContext;
        nextAmbient = elapsed + (contextName === "thinking" ? 1.5 : 8);
      }
      if (!active && !reducedMotion && elapsed >= nextAmbient) {
        const choices = contextName === "speaking" ? ["overte-idle-talking", "overte-idle-talking-6", "overte-idle-talking-7", "overte-idle-talking-5", "overte-idle-talking-4"]
          : contextName === "listening" ? ["overte-nod-2", "overte-neutral"]
          : contextName === "thinking" ? ["overte-think", "overte-neutral", "overte-think-2"]
          : ["overte-idle", "overte-idle-2", "overte-idle-3", "overte-idle-4", "overte-neutral", "overte-relaxed-3"];
        api.play(choices[ambientIndex++ % choices.length], { intensity: contextName === "speaking" ? 0.65 : 0.32, ambient: true });
        nextAmbient = elapsed + 16;
      }
      if (!active || disposed) return;
      const age = elapsed - active.started;
      const remaining = active.duration - age;
      const fade = active.stopAt === null ? 1 : 1 - ease((elapsed - active.stopAt) / active.fade);
      const weight = ease(age / 0.36) * ease(remaining / 0.42) * fade * active.weight;
      if (remaining <= 0 || fade <= 0) { active = null; transition = null; return; }
      for (const track of active.clip.tracks) {
        track.base.copy(track.node.quaternion);
        basePose.set(track.node, track.base);
        target.fromArray(track.interpolant.evaluate(Math.min(age * active.rate, active.clip.duration))).normalize();
        track.node.quaternion.slerp(target, weight);
      }
      if (transition) {
        const blend = ease((elapsed - transition.started) / 0.20);
        for (const [node, pose] of transition.poses) {
          if (!basePose.has(node)) { pose.base.copy(node.quaternion); basePose.set(node, pose.base); }
          node.quaternion.slerp(pose.shown, 1 - blend);
        }
        if (blend >= 1) transition = null;
      }
    },
    hasActiveGesture() { return Boolean(active); },
    diagnostics() { return { format: "VRMA 1.0", loaded: clips.size, available: [...clips.keys()], failed: [...failures], active: active?.name || null, duration: active?.duration || 0, ambient: Boolean(active?.ambient), reducedMotion }; },
    dispose() { restoreBase(); disposed = true; active = null; transition = null; clips.clear(); animations.clear(); },
  };
  return api;
}
