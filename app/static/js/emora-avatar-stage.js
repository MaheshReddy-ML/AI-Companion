import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMHumanBoneName, VRMUtils } from "@pixiv/three-vrm";

const MOUTH_EXPRESSIONS = ["aa", "a", "A", "ih", "i", "I", "ee", "e", "E", "oh", "o", "O", "ou", "u", "U"];
const VISEME_EXPRESSIONS = {
  open: ["aa", "a", "A", "ih", "i", "I"],
  wide: ["ee", "e", "E", "aa", "a", "A"],
  round: ["oh", "o", "O", "ou", "u", "U"],
  rest: [],
};
const BLINK_EXPRESSIONS = {
  both: ["blink", "Blink"],
  left: ["blinkLeft", "blink_l", "Blink_L"],
  right: ["blinkRight", "blink_r", "Blink_R"],
};
const LOOK_EXPRESSIONS = {
  up: ["lookUp", "LookUp"],
  down: ["lookDown", "LookDown"],
  left: ["lookLeft", "LookLeft"],
  right: ["lookRight", "LookRight"],
};
const EMOTION_EXPRESSIONS = {
  happy: ["happy", "joy", "fun"],
  relaxed: ["relaxed"],
  sad: ["sad", "sorrow"],
  surprised: ["surprised", "Surprised"],
  angry: ["angry", "Angry"],
};
const LOOK_EXPRESSION_NAMES = [...new Set(Object.values(LOOK_EXPRESSIONS).flat())];
const EMOTION_EXPRESSION_NAMES = [...new Set(Object.values(EMOTION_EXPRESSIONS).flat())];

const POSITIVE_WORDS = ["good", "great", "nice", "love", "glad", "happy", "proud", "wonderful", "amazing", "yes", "absolutely"];
const CONCERN_WORDS = ["sorry", "sad", "hurt", "tired", "worried", "anxious", "afraid", "hard", "difficult", "alone", "upset"];
const THINKING_WORDS = ["maybe", "think", "because", "perhaps", "consider", "step", "plan", "first", "next"];
const NEGATIVE_WORDS = ["no", "not", "never", "cannot", "can't", "won't", "stop"];

const BONE_NAMES = {
  hips: VRMHumanBoneName.Hips,
  head: VRMHumanBoneName.Head,
  neck: VRMHumanBoneName.Neck,
  chest: VRMHumanBoneName.Chest,
  upperChest: VRMHumanBoneName.UpperChest,
  spine: VRMHumanBoneName.Spine,
  leftShoulder: VRMHumanBoneName.LeftShoulder,
  rightShoulder: VRMHumanBoneName.RightShoulder,
  leftUpperArm: VRMHumanBoneName.LeftUpperArm,
  rightUpperArm: VRMHumanBoneName.RightUpperArm,
  leftLowerArm: VRMHumanBoneName.LeftLowerArm,
  rightLowerArm: VRMHumanBoneName.RightLowerArm,
  leftHand: VRMHumanBoneName.LeftHand,
  rightHand: VRMHumanBoneName.RightHand,
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function approach(current, target, delta, speed) {
  return current + (target - current) * Math.min(1, delta * speed);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesAny(text, words) {
  return words.some((word) => new RegExp(`(^|[^a-z])${escapeRegExp(word)}([^a-z]|$)`).test(text));
}

function analyzeSpeechMotion(value = "") {
  const text = String(value || "");
  const lower = text.toLowerCase();
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  const isQuestion = /\?/.test(text) || /\b(why|how|what|when|where|could|would|should|can|do you|are you)\b/.test(lower);
  const concerned = includesAny(lower, CONCERN_WORDS);
  const positive = /!/.test(text) || includesAny(lower, POSITIVE_WORDS);
  const thinking = includesAny(lower, THINKING_WORDS);
  const negative = includesAny(lower, NEGATIVE_WORDS);

  if (concerned) {
    return {
      emotion: "sad",
      gestureMode: "soothe",
      energy: clamp(0.64 + Math.min(wordCount, 40) / 40 * 0.12, 0.58, 0.84),
      tempo: 2.8,
      intensity: 0.44,
    };
  }

  if (positive) {
    return {
      emotion: "happy",
      gestureMode: "bright",
      energy: clamp(0.78 + Math.min(wordCount, 42) / 42 * 0.16, 0.72, 1),
      tempo: 4.7,
      intensity: 0.66,
    };
  }

  if (isQuestion) {
    return {
      emotion: "curious",
      gestureMode: "question",
      energy: clamp(0.72 + Math.min(wordCount, 36) / 36 * 0.12, 0.68, 0.95),
      tempo: 3.8,
      intensity: 0.58,
    };
  }

  if (negative) {
    return {
      emotion: "focused",
      gestureMode: "firm",
      energy: 0.74,
      tempo: 3.5,
      intensity: 0.48,
    };
  }

  return {
    emotion: thinking ? "thoughtful" : "relaxed",
    gestureMode: thinking ? "explain" : "calm",
    energy: clamp(0.68 + Math.min(wordCount, 50) / 50 * 0.16, 0.64, 0.9),
    tempo: thinking ? 3.6 : 3.1,
    intensity: thinking ? 0.54 : 0.38,
  };
}

function cueMotionFromText(value = "") {
  const text = String(value || "");
  const lower = text.toLowerCase();

  if (!lower.trim()) {
    return { mode: "calm", strength: 0.2, nod: 0, shake: 0 };
  }

  if (includesAny(lower, CONCERN_WORDS)) {
    return { mode: "soothe", emotion: "sad", strength: 0.58, nod: 0.2, shake: 0 };
  }

  if (/\?/.test(text)) {
    return { mode: "question", emotion: "curious", strength: 0.68, nod: 0.15, shake: 0 };
  }

  if (/!/.test(text) || includesAny(lower, POSITIVE_WORDS)) {
    return { mode: "bright", emotion: "happy", strength: 0.74, nod: 0.35, shake: 0 };
  }

  if (includesAny(lower, NEGATIVE_WORDS)) {
    return { mode: "firm", emotion: "focused", strength: 0.62, nod: 0, shake: 1 };
  }

  if (includesAny(lower, THINKING_WORDS)) {
    return { mode: "explain", emotion: "thoughtful", strength: 0.52, nod: 0.22, shake: 0 };
  }

  return { mode: "explain", strength: 0.42, nod: 0.18, shake: 0 };
}

function setExpression(expressionManager, name, value) {
  if (!expressionManager || !name) {
    return false;
  }

  try {
    if (typeof expressionManager.getExpression === "function" && !expressionManager.getExpression(name)) {
      return false;
    }
    expressionManager.setValue(name, value);
    return true;
  } catch {
    // Older VRM files vary in expression names; unsupported aliases can be ignored.
    return false;
  }
}

function setFirstExpression(expressionManager, names, value) {
  return names.some((name) => setExpression(expressionManager, name, value));
}

function getBone(vrm, name) {
  if (!vrm?.humanoid || !name) {
    return null;
  }

  try {
    return vrm.humanoid.getNormalizedBoneNode(name) || null;
  } catch {
    return null;
  }
}

function captureBaseRotations(bones) {
  return Object.fromEntries(
    Object.entries(bones)
      .filter(([, bone]) => Boolean(bone))
      .map(([name, bone]) => [name, bone.rotation.clone()]),
  );
}

function applyBoneRotation(bone, base, x = 0, y = 0, z = 0) {
  if (!bone || !base) {
    return;
  }

  bone.rotation.set(base.x + x, base.y + y, base.z + z);
}

function fitModelToStage(vrm) {
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.98 / Math.max(size.y, 0.001);

  vrm.scene.scale.setScalar(scale);
  vrm.scene.rotation.set(0, Math.PI, 0);
  vrm.scene.position.set(-center.x * scale, -box.min.y * scale - 0.035, -center.z * scale);
}

export function createEmoraAvatarStage(container) {
  const loaderElement = container.querySelector("[data-emora-avatar-loader]");
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const clock = new THREE.Clock();
  const modelRoot = new THREE.Group();
  const gazeTarget = new THREE.Object3D();
  const loader = new GLTFLoader();

  let currentVrm = null;
  let activeLoadId = 0;
  let rafId = 0;
  let bones = {};
  let baseRotations = {};

  const motion = {
    speaking: false,
    listening: false,
    thinking: false,
    mouthShape: "rest",
    mouthTarget: 0,
    mouthValue: 0,
    speechEnergy: 0.75,
    emotion: "relaxed",
    gestureMode: "calm",
    gestureTempo: 3.2,
    gestureIntensity: 0.38,
    gestureSeed: 0,
    speechStartTime: 0,
    stanceSeed: randomBetween(0, Math.PI * 2),
    lastCueAt: -10,
    cueStrength: 0,
    cueMode: "calm",
    cueNod: 0,
    cueShake: 0,
    nextBlinkAt: 0.7,
    blinkStartedAt: -10,
    blinkDuration: 0.12,
    nextGazeShift: 0,
    gazeX: 0,
    gazeY: 0,
    gazeTargetX: 0,
    gazeTargetY: 0,
    expressionWeights: {
      happy: 0,
      relaxed: 0,
      sad: 0,
      surprised: 0,
      angry: 0,
    },
  };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "emora-avatar-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  scene.add(modelRoot);
  gazeTarget.position.set(0, 1.36, 2.2);
  scene.add(gazeTarget);
  scene.add(new THREE.HemisphereLight(0xf8fbff, 0x2b3038, 2.1));

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
  keyLight.position.set(1.8, 2.7, 2.2);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x8bded4, 1.2);
  rimLight.position.set(-2.2, 1.5, -1.4);
  scene.add(rimLight);

  const floorMaterial = new THREE.MeshBasicMaterial({
    color: 0x05070a,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const floorShadow = new THREE.Mesh(new THREE.CircleGeometry(0.72, 48), floorMaterial);
  floorShadow.rotation.x = -Math.PI / 2;
  floorShadow.position.set(0, 0.012, -0.08);
  floorShadow.scale.set(1.5, 0.52, 1);
  scene.add(floorShadow);

  loader.crossOrigin = "anonymous";
  loader.register((parser) => new VRMLoaderPlugin(parser));

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const aspect = width / height;

    camera.aspect = aspect;
    camera.position.set(0, aspect > 0.78 ? 1.18 : 1.22, aspect > 0.78 ? 2.65 : 3.08);
    camera.lookAt(0, 1.02, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function setLoaderState(message = "", active = false) {
    if (!loaderElement) {
      return;
    }

    loaderElement.hidden = !active;
    loaderElement.textContent = message;
  }

  function clearCurrentModel() {
    if (!currentVrm) {
      return;
    }

    modelRoot.remove(currentVrm.scene);
    if (currentVrm.lookAt) {
      currentVrm.lookAt.target = null;
    }
    VRMUtils.deepDispose?.(currentVrm.scene);
    currentVrm = null;
    bones = {};
    baseRotations = {};
  }

  function prepareVrm(vrm) {
    VRMUtils.removeUnnecessaryVertices?.(vrm.scene);
    VRMUtils.combineSkeletons?.(vrm.scene);
    VRMUtils.combineMorphs?.(vrm);

    vrm.scene.traverse((object) => {
      object.frustumCulled = false;
    });

    fitModelToStage(vrm);
    motion.stanceSeed = randomBetween(0, Math.PI * 2);
    modelRoot.position.set(0, 0, 0);
    modelRoot.rotation.set(0, 0, 0);

    bones = Object.fromEntries(Object.entries(BONE_NAMES).map(([label, boneName]) => [label, getBone(vrm, boneName)]));
    baseRotations = captureBaseRotations(bones);

    if (vrm.lookAt) {
      vrm.lookAt.autoUpdate = true;
      vrm.lookAt.target = gazeTarget;
    }
  }

  function setMouth(shape = "rest") {
    motion.mouthShape = VISEME_EXPRESSIONS[shape] ? shape : "open";
    motion.mouthTarget = motion.mouthShape === "rest" ? 0 : 1;
  }

  function blinkValueForElapsed(elapsed) {
    if (elapsed >= motion.nextBlinkAt) {
      motion.blinkStartedAt = elapsed;
      motion.blinkDuration = randomBetween(0.08, 0.15);
      motion.nextBlinkAt = elapsed + randomBetween(motion.speaking ? 1.2 : 2.1, motion.speaking ? 3.1 : 5.2);
    }

    const progress = (elapsed - motion.blinkStartedAt) / motion.blinkDuration;
    if (progress < 0 || progress > 1) {
      return 0;
    }

    return Math.pow(Math.sin(progress * Math.PI), 0.45);
  }

  function updateGaze(delta, elapsed) {
    if (elapsed >= motion.nextGazeShift) {
      const focusWidth = motion.listening ? 0.04 : motion.speaking ? 0.09 : 0.13;
      const focusHeight = motion.speaking ? 0.07 : 0.055;
      const thinkingDrop = motion.thinking && !motion.speaking ? -0.13 : 0;

      motion.gazeTargetX = randomBetween(-focusWidth, focusWidth);
      motion.gazeTargetY = randomBetween(-focusHeight, focusHeight) + thinkingDrop;
      motion.nextGazeShift = elapsed + randomBetween(motion.speaking ? 0.5 : 1.25, motion.speaking ? 1.35 : 3.8);
    }

    const gazeSpeed = motion.listening ? 8 : motion.speaking ? 5.5 : 3.2;
    motion.gazeX = approach(motion.gazeX, motion.gazeTargetX, delta, gazeSpeed);
    motion.gazeY = approach(motion.gazeY, motion.gazeTargetY, delta, gazeSpeed);
    gazeTarget.position.set(motion.gazeX, 1.36 + motion.gazeY, 2.2);
  }

  function applyLookExpressionFallback(manager) {
    if (currentVrm?.lookAt) {
      return;
    }

    LOOK_EXPRESSION_NAMES.forEach((name) => setExpression(manager, name, 0));
    setFirstExpression(manager, LOOK_EXPRESSIONS.left, clamp(-motion.gazeX * 5.5, 0, 0.8));
    setFirstExpression(manager, LOOK_EXPRESSIONS.right, clamp(motion.gazeX * 5.5, 0, 0.8));
    setFirstExpression(manager, LOOK_EXPRESSIONS.up, clamp(motion.gazeY * 5.2, 0, 0.7));
    setFirstExpression(manager, LOOK_EXPRESSIONS.down, clamp(-motion.gazeY * 5.2, 0, 0.7));
  }

  function emotionTargets(elapsed) {
    const targets = {
      happy: 0,
      relaxed: motion.speaking ? 0.08 : 0.13 + 0.025 * Math.sin(elapsed * 0.7),
      sad: 0,
      surprised: 0,
      angry: 0,
    };

    if (motion.thinking && !motion.speaking) {
      targets.relaxed = Math.max(targets.relaxed, 0.16);
      targets.surprised = 0.035;
    }

    if (motion.emotion === "happy") {
      targets.happy = motion.speaking ? 0.26 : 0.18;
      targets.relaxed = 0.1;
    } else if (motion.emotion === "sad") {
      targets.sad = motion.speaking ? 0.12 : 0.07;
      targets.relaxed = 0.08;
    } else if (motion.emotion === "curious") {
      targets.surprised = motion.speaking ? 0.11 : 0.05;
      targets.relaxed = 0.09;
    } else if (motion.emotion === "focused") {
      targets.angry = 0.035;
      targets.relaxed = 0.08;
    } else if (motion.emotion === "thoughtful") {
      targets.relaxed = 0.16;
      targets.surprised = 0.025;
    }

    return targets;
  }

  function updateExpressions(delta, elapsed) {
    if (!currentVrm?.expressionManager) {
      return;
    }

    const manager = currentVrm.expressionManager;
    const mouthSpeed = motion.speaking ? 18 : 12;
    const blink = blinkValueForElapsed(elapsed);
    const mouthPulse = motion.speaking ? (0.52 + 0.46 * Math.sin(elapsed * 22) ** 2) * motion.speechEnergy : 1;
    const emotionWeights = emotionTargets(elapsed);

    motion.mouthValue += (motion.mouthTarget - motion.mouthValue) * Math.min(1, delta * mouthSpeed);

    MOUTH_EXPRESSIONS.forEach((name) => setExpression(manager, name, 0));
    VISEME_EXPRESSIONS[motion.mouthShape].forEach((name) => {
      setExpression(manager, name, clamp(motion.mouthValue * mouthPulse));
    });

    [...BLINK_EXPRESSIONS.both, ...BLINK_EXPRESSIONS.left, ...BLINK_EXPRESSIONS.right].forEach((name) => {
      setExpression(manager, name, 0);
    });
    if (!setFirstExpression(manager, BLINK_EXPRESSIONS.both, clamp(blink))) {
      setFirstExpression(manager, BLINK_EXPRESSIONS.left, clamp(blink));
      setFirstExpression(manager, BLINK_EXPRESSIONS.right, clamp(blink));
    }

    applyLookExpressionFallback(manager);

    EMOTION_EXPRESSION_NAMES.forEach((name) => setExpression(manager, name, 0));
    Object.entries(emotionWeights).forEach(([name, target]) => {
      motion.expressionWeights[name] = approach(motion.expressionWeights[name] || 0, target, delta, 5.5);
      setFirstExpression(manager, EMOTION_EXPRESSIONS[name], clamp(motion.expressionWeights[name], 0, 0.32));
    });
  }

  function updateRig(delta, elapsed) {
    const talk = motion.speaking ? 1 : 0;
    const listening = motion.listening && !motion.speaking ? 1 : 0;
    const thinking = motion.thinking && !motion.speaking ? 1 : 0;
    const breath = Math.sin(elapsed * 1.38 + motion.stanceSeed);
    const breathLift = 0.5 + 0.5 * breath;
    const sway = Math.sin(elapsed * 0.48 + motion.stanceSeed);
    const slowSway = Math.sin(elapsed * 0.26 + motion.stanceSeed * 0.7);
    const weightShift = Math.sin(elapsed * 0.34 + motion.stanceSeed);
    const speechElapsed = Math.max(0, elapsed - motion.speechStartTime);
    const beat = Math.sin(speechElapsed * motion.gestureTempo + motion.gestureSeed) * 0.78 + Math.sin(speechElapsed * 1.7 + motion.gestureSeed * 0.4) * 0.22;
    const alternateBeat = Math.sin(speechElapsed * motion.gestureTempo * 0.92 + motion.gestureSeed + Math.PI * 0.82) * 0.78 + Math.sin(speechElapsed * 1.45 + motion.gestureSeed) * 0.22;
    const beatPulse = Math.pow(Math.max(0, beat), 1.45);
    const cueAge = elapsed - motion.lastCueAt;
    const cue = cueAge >= 0 && cueAge < 0.95 ? (1 - cueAge / 0.95) * motion.cueStrength : 0;
    const gesture = talk * motion.gestureIntensity * (0.18 + 0.62 * Math.max(beatPulse, cue));
    const gestureMode = cue > 0.18 ? motion.cueMode : motion.gestureMode;
    const talkNod = (Math.sin(speechElapsed * 5.1) * 0.62 + Math.sin(speechElapsed * 8.4 + 1.1) * 0.38) * talk * motion.speechEnergy;
    const cueNod = cue * motion.cueNod;
    const cueShake = cue * motion.cueShake * Math.sin(cueAge * 18);
    const listenLean = listening * 0.045;
    const thinkingDrop = thinking * 0.065;
    const curiousTilt = motion.emotion === "curious" ? 0.025 * talk : 0;
    const bodyLeanX = 0.012 * slowSway + 0.018 * talk * Math.sin(speechElapsed * 1.15 + motion.gestureSeed);
    const bodyLeanZ = 0.018 * weightShift + 0.014 * talk * Math.sin(speechElapsed * 0.94 + motion.gestureSeed);
    const bodyRise = 0.007 * breathLift + 0.004 * talk * Math.max(0, Math.sin(speechElapsed * 2.2));

    modelRoot.position.x = approach(modelRoot.position.x, bodyLeanX, delta, 2.3);
    modelRoot.position.y = approach(modelRoot.position.y, bodyRise, delta, 2.8);
    modelRoot.rotation.z = approach(modelRoot.rotation.z, bodyLeanZ, delta, 2.1);

    let leftUpperX = 0.13 + 0.026 * breath - 0.012 * weightShift;
    let leftUpperY = 0.055 + 0.012 * slowSway;
    let leftUpperZ = 1.0 + 0.03 * sway;
    let rightUpperX = 0.11 + 0.022 * breath + 0.012 * weightShift;
    let rightUpperY = -0.052 + 0.01 * slowSway;
    let rightUpperZ = -1.03 - 0.028 * sway;
    let leftLowerX = 0.18 + 0.022 * Math.sin(elapsed * 0.74 + motion.stanceSeed);
    let leftLowerY = -0.04 + 0.012 * slowSway;
    let leftLowerZ = 0.2 + 0.018 * weightShift;
    let rightLowerX = 0.16 + 0.022 * Math.sin(elapsed * 0.7 + motion.stanceSeed + 0.9);
    let rightLowerY = 0.04 + 0.01 * slowSway;
    let rightLowerZ = -0.2 + 0.014 * weightShift;
    let leftHandX = 0.03 * Math.sin(elapsed * 1.1);
    let leftHandY = 0.02 * Math.sin(elapsed * 0.8);
    let leftHandZ = 0.04 * Math.sin(elapsed * 0.9);
    let rightHandX = 0.03 * Math.sin(elapsed * 1.05);
    let rightHandY = -0.02 * Math.sin(elapsed * 0.82);
    let rightHandZ = -0.04 * Math.sin(elapsed * 0.94);

    if (gestureMode === "bright") {
      leftUpperX -= 0.085 * gesture;
      rightUpperX -= 0.075 * gesture;
      leftUpperY += 0.05 * gesture;
      rightUpperY -= 0.05 * gesture;
      leftUpperZ += 0.1 * gesture;
      rightUpperZ -= 0.12 * gesture;
      leftLowerX += 0.18 * gesture + 0.028 * beat * talk;
      rightLowerX += 0.2 * gesture + 0.028 * alternateBeat * talk;
      leftHandZ += 0.16 * gesture + 0.035 * beat;
      rightHandZ -= 0.18 * gesture + 0.035 * alternateBeat;
    } else if (gestureMode === "question") {
      leftUpperX -= 0.055 * gesture;
      rightUpperX -= 0.055 * gesture;
      leftUpperY += 0.08 * gesture;
      rightUpperY -= 0.08 * gesture;
      leftLowerX += 0.24 * gesture;
      rightLowerX += 0.25 * gesture;
      leftLowerZ += 0.06 * gesture;
      rightLowerZ -= 0.06 * gesture;
      leftHandX += 0.16 * gesture;
      rightHandX += 0.16 * gesture;
      leftHandZ += 0.15 * gesture;
      rightHandZ -= 0.15 * gesture;
    } else if (gestureMode === "soothe") {
      const softWave = 0.5 + 0.5 * Math.sin(speechElapsed * 2.4 + motion.gestureSeed);
      leftUpperX += 0.035 * gesture;
      rightUpperX += 0.035 * gesture;
      leftUpperY += 0.025 * gesture;
      rightUpperY -= 0.025 * gesture;
      leftLowerX += 0.13 * gesture * softWave;
      rightLowerX += 0.13 * gesture * softWave;
      leftLowerZ -= 0.045 * gesture;
      rightLowerZ += 0.045 * gesture;
      leftHandY += 0.14 * gesture * softWave;
      rightHandY -= 0.14 * gesture * softWave;
    } else if (gestureMode === "firm") {
      leftUpperX -= 0.045 * gesture;
      rightUpperX -= 0.045 * gesture;
      leftLowerX += 0.16 * gesture + 0.04 * Math.max(0, beat);
      rightLowerX += 0.16 * gesture + 0.04 * Math.max(0, alternateBeat);
      leftHandX += 0.08 * gesture;
      rightHandX += 0.08 * gesture;
    } else {
      const leftExplain = gesture * (0.55 + 0.45 * Math.max(0, beat));
      const rightExplain = gesture * (0.55 + 0.45 * Math.max(0, alternateBeat));
      leftUpperX -= 0.05 * leftExplain;
      rightUpperX -= 0.05 * rightExplain;
      leftUpperY += 0.04 * leftExplain;
      rightUpperY -= 0.04 * rightExplain;
      leftLowerX += 0.16 * leftExplain;
      rightLowerX += 0.17 * rightExplain;
      leftHandZ += 0.1 * leftExplain;
      rightHandZ -= 0.11 * rightExplain;
    }

    leftUpperX -= listenLean;
    rightUpperX -= listenLean;
    leftLowerX += listening * 0.08;
    rightLowerX += listening * 0.08;

    applyBoneRotation(bones.hips, baseRotations.hips, 0.006 * breath - listenLean * 0.25, 0.018 * sway, 0.025 * weightShift);
    applyBoneRotation(
      bones.head,
      baseRotations.head,
      0.012 * breath + 0.022 * talkNod + 0.04 * cueNod + thinkingDrop - listenLean,
      0.034 * sway + 0.016 * talkNod + 0.04 * cueShake + motion.gazeX * 0.16,
      0.018 * Math.sin(elapsed * 0.62 + motion.stanceSeed) + curiousTilt - motion.gazeX * 0.05,
    );
    applyBoneRotation(bones.neck, baseRotations.neck, 0.01 * breath + 0.014 * talkNod + 0.018 * cueNod, 0.016 * sway + 0.018 * cueShake, -bodyLeanZ * 0.25);
    applyBoneRotation(bones.upperChest, baseRotations.upperChest, 0.022 * breath - listenLean * 0.75, 0.026 * sway + 0.014 * talk * beat, -0.018 * weightShift);
    applyBoneRotation(bones.chest, baseRotations.chest, 0.018 * breath - listenLean * 0.55, 0.018 * sway + 0.01 * talk * alternateBeat, -0.012 * weightShift);
    applyBoneRotation(bones.spine, baseRotations.spine, 0.012 * breath, 0.014 * sway, 0.01 * weightShift);
    applyBoneRotation(bones.leftShoulder, baseRotations.leftShoulder, 0.02 * breath - 0.012 * gesture, 0.018 * gesture, 0.028 * gesture + 0.012 * weightShift);
    applyBoneRotation(bones.rightShoulder, baseRotations.rightShoulder, 0.018 * breath - 0.01 * gesture, -0.018 * gesture, -0.028 * gesture + 0.01 * weightShift);
    applyBoneRotation(bones.leftUpperArm, baseRotations.leftUpperArm, leftUpperX, leftUpperY, leftUpperZ + 0.018 * talkNod);
    applyBoneRotation(bones.rightUpperArm, baseRotations.rightUpperArm, rightUpperX, rightUpperY, rightUpperZ - 0.018 * talkNod);
    applyBoneRotation(bones.leftLowerArm, baseRotations.leftLowerArm, leftLowerX, leftLowerY, leftLowerZ + 0.012 * talkNod);
    applyBoneRotation(bones.rightLowerArm, baseRotations.rightLowerArm, rightLowerX, rightLowerY, rightLowerZ - 0.012 * talkNod);
    applyBoneRotation(bones.leftHand, baseRotations.leftHand, leftHandX, leftHandY, leftHandZ);
    applyBoneRotation(bones.rightHand, baseRotations.rightHand, rightHandX, rightHandY, rightHandZ);
  }

  function animate() {
    rafId = window.requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;

    if (currentVrm) {
      updateGaze(delta, elapsed);
      updateRig(delta, elapsed);
      updateExpressions(delta, elapsed);
      currentVrm.update(delta);
    }

    renderer.render(scene, camera);
  }

  animate();

  return {
    async setCharacter(character) {
      if (!character?.model || currentVrm?.userData?.emoraCharacterId === character.id) {
        return;
      }

      const loadId = ++activeLoadId;
      container.dataset.character = character.id;
      setLoaderState("Loading avatar", true);

      await new Promise((resolve, reject) => {
        loader.load(
          character.model,
          (gltf) => {
            if (loadId !== activeLoadId) {
              VRMUtils.deepDispose?.(gltf.scene);
              resolve();
              return;
            }

            const vrm = gltf.userData.vrm;
            if (!vrm) {
              reject(new Error("Loaded file is not a VRM avatar."));
              return;
            }

            clearCurrentModel();
            prepareVrm(vrm);
            vrm.userData = vrm.userData || {};
            vrm.userData.emoraCharacterId = character.id;
            currentVrm = vrm;
            modelRoot.add(vrm.scene);
            setMouth("rest");
            setLoaderState("", false);
            resolve();
          },
          undefined,
          (error) => {
            if (loadId === activeLoadId) {
              setLoaderState("Avatar unavailable", true);
            }
            reject(error);
          },
        );
      });
    },
    setSpeaking(isSpeaking, spokenText = "") {
      motion.speaking = Boolean(isSpeaking);
      if (motion.speaking) {
        const text = String(spokenText || "");
        const profile = analyzeSpeechMotion(text);
        const punctuationLift = /[!?]/.test(text) ? 0.08 : 0;
        motion.speechEnergy = clamp(profile.energy + punctuationLift, 0.62, 1);
        motion.emotion = profile.emotion;
        motion.gestureMode = profile.gestureMode;
        motion.gestureTempo = profile.tempo;
        motion.gestureIntensity = profile.intensity;
        motion.gestureSeed = randomBetween(0, Math.PI * 2);
        motion.speechStartTime = clock.elapsedTime;
        motion.lastCueAt = clock.elapsedTime;
        motion.cueStrength = 0.45;
        motion.cueMode = profile.gestureMode;
        motion.cueNod = profile.gestureMode === "firm" ? 0 : 0.25;
        motion.cueShake = profile.gestureMode === "firm" ? 0.7 : 0;
      }
      if (!motion.speaking) {
        setMouth("rest");
        motion.emotion = motion.thinking ? "thoughtful" : "relaxed";
        motion.gestureMode = "calm";
      } else if (motion.mouthShape === "rest") {
        setMouth("open");
      }
    },
    cueSpeech(fragment = "") {
      if (!motion.speaking) {
        return;
      }

      const cue = cueMotionFromText(fragment);
      motion.lastCueAt = clock.elapsedTime;
      motion.cueStrength = cue.strength;
      motion.cueMode = cue.mode;
      motion.cueNod = cue.nod;
      motion.cueShake = cue.shake;
      if (cue.emotion) {
        motion.emotion = cue.emotion;
      }
    },
    setListening(isListening) {
      motion.listening = Boolean(isListening);
    },
    setThinking(isThinking) {
      motion.thinking = Boolean(isThinking);
      if (!motion.speaking) {
        motion.emotion = motion.thinking ? "thoughtful" : "relaxed";
      }
    },
    setMouth,
    destroy() {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      clearCurrentModel();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
