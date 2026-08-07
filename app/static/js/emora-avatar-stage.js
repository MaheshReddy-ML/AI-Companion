import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
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
const SQUINT_EXPRESSIONS = ["squint", "Squint", "eyeSquint"];
const CHEEK_EXPRESSIONS = ["cheek", "Cheek", "cheekPuff"];
const BROW_RAISE_EXPRESSIONS = ["browUp", "BrowUp", "eyebrowUp"];
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

const POSITIVE_WORDS = ["good", "great", "nice", "love", "glad", "happy", "proud", "wonderful", "amazing", "yes", "absolutely", "excited"];
const CONCERN_WORDS = ["sorry", "sad", "hurt", "tired", "worried", "anxious", "afraid", "hard", "difficult", "alone", "upset", "stress"];
const THINKING_WORDS = ["maybe", "think", "because", "perhaps", "consider", "step", "plan", "first", "next", "try", "let"];
const NEGATIVE_WORDS = ["no", "not", "never", "cannot", "can't", "won't", "stop"];
const CUTE_WORDS = ["hi", "hello", "hey", "thanks", "thank", "welcome", "cute", "sweet", "yay", "nice", "okay", "ok", "friend"];
const EMPHASIS_WORDS = [
  "always",
  "best",
  "definitely",
  "important",
  "never",
  "please",
  "remember",
  "together",
  "understand",
];
const ACTION_PRIORITIES = {
  none: 0,
  shy: 1,
  idleShift: 1,
  acknowledge: 2,
  sparkle: 2,
  heart: 3,
  explain: 3,
  emphasize: 3,
  wave: 4,
  cheer: 5,
};

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
  leftUpperLeg: VRMHumanBoneName.LeftUpperLeg,
  rightUpperLeg: VRMHumanBoneName.RightUpperLeg,
  leftLowerLeg: VRMHumanBoneName.LeftLowerLeg,
  rightLowerLeg: VRMHumanBoneName.RightLowerLeg,
  leftFoot: VRMHumanBoneName.LeftFoot,
  rightFoot: VRMHumanBoneName.RightFoot,
};
const COLOR_TEXTURE_KEYS = ["map", "emissiveMap", "matcap", "shadeMultiplyTexture", "shadingShiftTexture"];
const DATA_TEXTURE_KEYS = ["normalMap", "roughnessMap", "metalnessMap", "alphaMap", "aoMap", "bumpMap"];
const CAMERA_FRAMING = {
  fov: 31,
  bodyMargin: 1.16,
  widthMargin: 1.12,
};

// The most recently created interactive stage is the target for the small
// public impact helpers below.  A page can still use its own returned stage
// instance when it hosts more than one avatar.
let activeImpactStage = null;

/** Give a humanoid limb a brief anime-style squash/stretch impact. */
export function applyImpactStretch(boneName, stretchAmount = 1.2, returnSpeed = 12) {
  return activeImpactStage?.applyImpactStretch(boneName, stretchAmount, returnSpeed) || false;
}

/** Add a decaying camera/FOV hit to the active Emora stage. */
export function triggerImpactShake(intensity = 0.35, duration = 0.22) {
  return activeImpactStage?.triggerImpactShake(intensity, duration) || false;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function approach(current, target, delta, speed) {
  return current + (target - current) * Math.min(1, delta * speed);
}

function dampedBlend(current, target, delta, halfLife = 0.12) {
  return target + (current - target) * Math.pow(2, -delta / Math.max(0.001, halfLife));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function seededNoise(seed, x) {
  const value = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function smoothNoise(seed, x) {
  const floor = Math.floor(x);
  const fraction = x - floor;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const a = seededNoise(seed, floor);
  const b = seededNoise(seed, floor + 1);
  return (a + (b - a) * eased) * 2 - 1;
}

class ScalarSpring {
  constructor({ value = 0, frequency = 8, damping = 1 } = {}) {
    this.value = value;
    this.velocity = 0;
    this.frequency = frequency;
    this.damping = damping;
  }

  reset(value = 0) {
    this.value = value;
    this.velocity = 0;
  }

  update(target, delta) {
    const omega = Math.max(0.001, this.frequency) * Math.PI * 2;
    const steps = Math.max(1, Math.ceil(delta / 0.008));
    const stepDelta = delta / steps;

    for (let index = 0; index < steps; index += 1) {
      const acceleration = omega * omega * (target - this.value) - 2 * this.damping * omega * this.velocity;
      this.velocity += acceleration * stepDelta;
      this.value += this.velocity * stepDelta;
    }

    return this.value;
  }
}

class EulerSpring {
  constructor({ frequency = 7, damping = 1 } = {}) {
    this.x = new ScalarSpring({ frequency, damping });
    this.y = new ScalarSpring({ frequency, damping });
    this.z = new ScalarSpring({ frequency, damping });
  }

  reset(x = 0, y = 0, z = 0) {
    this.x.reset(x);
    this.y.reset(y);
    this.z.reset(z);
  }

  update(target, delta) {
    return {
      x: this.x.update(target.x || 0, delta),
      y: this.y.update(target.y || 0, delta),
      z: this.z.update(target.z || 0, delta),
    };
  }
}

function smoothPulse(age, duration) {
  if (age < 0 || age > duration) {
    return 0;
  }

  const progress = age / duration;
  const rise = clamp(progress / 0.28);
  const fall = clamp((1 - progress) / 0.38);
  return Math.sin(Math.min(1, rise) * Math.PI * 0.5) * Math.sin(Math.min(1, fall) * Math.PI * 0.5);
}

function smoothStep(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function actionProgress(age, duration) {
  if (age < 0 || duration <= 0) {
    return 0;
  }

  return clamp(age / duration);
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
      intensity: 0.58,
    };
  }

  if (positive) {
    return {
      emotion: "happy",
      gestureMode: "bright",
      energy: clamp(0.78 + Math.min(wordCount, 42) / 42 * 0.16, 0.72, 1),
      tempo: 4.25,
      intensity: 0.82,
    };
  }

  if (isQuestion) {
    return {
      emotion: "curious",
      gestureMode: "question",
      energy: clamp(0.72 + Math.min(wordCount, 36) / 36 * 0.12, 0.68, 0.95),
      tempo: 3.45,
      intensity: 0.72,
    };
  }

  if (negative) {
    return {
      emotion: "focused",
      gestureMode: "firm",
      energy: 0.74,
      tempo: 3.5,
      intensity: 0.54,
    };
  }

  return {
    emotion: thinking ? "thoughtful" : "relaxed",
    gestureMode: thinking ? "explain" : "calm",
    energy: clamp(0.68 + Math.min(wordCount, 50) / 50 * 0.16, 0.64, 0.9),
    tempo: thinking ? 3.6 : 3.1,
    intensity: thinking ? 0.68 : 0.52,
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

function isEmphasisCue(value = "") {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z']/g, "");
  return normalized.length > 2 && EMPHASIS_WORDS.includes(normalized);
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

function applySmoothBoneRotation(bone, base, delta, speed, x = 0, y = 0, z = 0) {
  if (!bone || !base) {
    return;
  }

  const targetEuler = bone.userData.emoraTargetEuler || new THREE.Euler();
  const targetQuaternion = bone.userData.emoraTargetQuaternion || new THREE.Quaternion();
  bone.userData.emoraTargetEuler = targetEuler;
  bone.userData.emoraTargetQuaternion = targetQuaternion;

  targetEuler.set(base.x + x, base.y + y, base.z + z, bone.rotation.order);
  targetQuaternion.setFromEuler(targetEuler);
  bone.quaternion.slerp(targetQuaternion, Math.min(1, delta * speed));
}

function applyBoneRotation(bone, base, x = 0, y = 0, z = 0) {
  if (!bone || !base) {
    return;
  }

  bone.rotation.set(base.x + x, base.y + y, base.z + z, bone.rotation.order);
}

function getTextureResolution(texture) {
  const image = texture?.image;
  if (!image) {
    return null;
  }
  return {
    width: image.naturalWidth || image.videoWidth || image.width || 0,
    height: image.naturalHeight || image.videoHeight || image.height || 0,
  };
}

function configureTexture(texture, renderer, colorTexture = false) {
  if (!texture) {
    return;
  }

  if (colorTexture) {
    texture.colorSpace = THREE.SRGBColorSpace;
  } else {
    texture.colorSpace = THREE.NoColorSpace;
  }
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
  texture.needsUpdate = true;
}

function configureVrmMaterial(material, renderer, diagnostics) {
  if (!material) {
    return;
  }

  material.needsUpdate = true;
  material.precision = "highp";

  COLOR_TEXTURE_KEYS.forEach((key) => {
    if (material[key]) {
      configureTexture(material[key], renderer, true);
      const resolution = getTextureResolution(material[key]);
      if (resolution) {
        diagnostics.textures.push({ material: material.name || material.type, key, ...resolution });
      }
    }
  });
  DATA_TEXTURE_KEYS.forEach((key) => configureTexture(material[key], renderer, false));

  if ("envMapIntensity" in material) {
    material.envMapIntensity = Math.max(material.envMapIntensity ?? 0, 0.28);
  }
  if ("toneMapped" in material && /mtoon/i.test(material.type || material.name || "")) {
    material.toneMapped = false;
  }
}

function fitModelToStage(vrm, targetHeight = 1.72) {
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = targetHeight / Math.max(size.y, 0.001);

  vrm.scene.scale.setScalar(scale);
  vrm.scene.rotation.set(0, Math.PI, 0);
  vrm.scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

  vrm.scene.updateMatrixWorld(true);
  const alignedBox = new THREE.Box3().setFromObject(vrm.scene);
  vrm.scene.position.y -= alignedBox.min.y;
  vrm.scene.updateMatrixWorld(true);

  // Capture bounds only after scale, orientation, and ground placement are
  // final. These values become the single source for camera framing.
  const groundedBox = new THREE.Box3().setFromObject(vrm.scene);
  const groundedSize = groundedBox.getSize(new THREE.Vector3());
  const groundedCenter = groundedBox.getCenter(new THREE.Vector3());
  const hips = getBone(vrm, VRMHumanBoneName.Hips);
  const hipsPosition = new THREE.Vector3();
  hips?.getWorldPosition(hipsPosition);

  const stageApi = {
    originalHeight: size.y,
    scale,
    stageHeight: groundedSize.y,
    stageWidth: groundedSize.x,
    stageDepth: groundedSize.z,
    stageCenter: groundedCenter.toArray(),
    stageBounds: {
      min: groundedBox.min.toArray(),
      max: groundedBox.max.toArray(),
    },
    hipsX: hips ? hipsPosition.x : groundedCenter.x,
    hipsY: hips ? hipsPosition.y : groundedCenter.y,
    groundOffset: -alignedBox.min.y,
  };
  activeImpactStage = stageApi;
  return stageApi;
}

export function createEmoraAvatarStage(container, options = {}) {
  const framing = { ...CAMERA_FRAMING, ...(options.camera || {}) };
  const loaderElement = container.querySelector("[data-emora-avatar-loader]");
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const clock = new THREE.Clock();
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const modelRoot = new THREE.Group();
  const gazeTarget = new THREE.Object3D();
  const loader = new GLTFLoader();

  let currentVrm = null;
  let activeLoadId = 0;
  let rafId = 0;
  let bones = {};
  let baseRotations = {};
  let greetingTimer = 0;
  let modelMetrics = null;
  let lastDiagnostics = null;
  let lastCameraProjection = null;
  const impact = {
    startedAt: -10,
    duration: 0,
    intensity: 0,
    stretches: new Map(),
  };

  container.dataset.avatarReady = "false";

  const motion = {
    speaking: false,
    listening: false,
    thinking: false,
    audioLevel: 0,
    audioLevelTarget: 0,
    speechIntensity: 0,
    mouthShape: "rest",
    mouthTarget: 0,
    mouthValue: 0,
    mouthPulseValue: 0,
    mouthPulseTarget: 0,
    speechEnergy: 0.75,
    engagementTarget: 0.42,
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
    blinkHold: 0,
    pendingDoubleBlink: false,
    blinkSide: "both",
    blinkEmotionBias: 0,
    nextGazeShift: 0,
    gazeX: 0,
    gazeY: 0,
    gazeTargetX: 0,
    gazeTargetY: 0,
    gazeHoldUntil: 0,
    attentionX: 0,
    attentionY: 0,
    attentionLostUntil: 0,
    nextAttentionAt: 2.4,
    nextListenNodAt: 0,
    listenNodStartedAt: -10,
    listenNodDuration: 0,
    listenNodStrength: 0,
    expressionWeights: {
      happy: 0,
      relaxed: 0,
      sad: 0,
      surprised: 0,
      angry: 0,
    },
    actionMode: "none",
    actionStartedAt: -10,
    actionDuration: 0,
    actionStrength: 0,
    actionSeed: randomBetween(0, Math.PI * 2),
    actionCooldownUntil: 0,
    actionPriority: 0,
    nextIdleActionAt: 4.2,
    introAlpha: 0,
    introTarget: 0,
    rigTargets: {},
    rigSprings: {},
  };

  const springs = {
    gazeX: new ScalarSpring({ frequency: 4.6, damping: 0.92 }),
    gazeY: new ScalarSpring({ frequency: 4.2, damping: 0.95 }),
    modelX: new ScalarSpring({ frequency: 1.8, damping: 1 }),
    modelY: new ScalarSpring({ frequency: 2.2, damping: 1 }),
    modelZ: new ScalarSpring({ frequency: 1.7, damping: 1 }),
    modelRotZ: new ScalarSpring({ frequency: 1.6, damping: 1 }),
    mouth: new ScalarSpring({ frequency: 12, damping: 0.86 }),
    expression: new ScalarSpring({ frequency: 3.4, damping: 1 }),
    engagement: new ScalarSpring({ value: 0.42, frequency: 1.7, damping: 1 }),
    cameraX: new ScalarSpring({ frequency: 1.6, damping: 1 }),
    cameraY: new ScalarSpring({ frequency: 1.6, damping: 1 }),
    cameraZ: new ScalarSpring({ frequency: 1.6, damping: 1 }),
    cameraLookY: new ScalarSpring({ frequency: 1.8, damping: 1 }),
    cameraFov: new ScalarSpring({ value: CAMERA_FRAMING.fov, frequency: 2.8, damping: 1 }),
  };

  THREE.ColorManagement.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping || THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "emora-avatar-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.opacity = "0";
  container.appendChild(renderer.domElement);

  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(renderer), 0.035).texture;
  scene.add(modelRoot);
  gazeTarget.position.set(0, 1.36, 2.2);
  scene.add(gazeTarget);
  scene.add(new THREE.HemisphereLight(0xf9fbff, 0x3c4050, 1.75));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.35);
  keyLight.position.set(1.8, 2.45, 2.35);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.3;
  keyLight.shadow.camera.far = 8;
  keyLight.shadow.bias = -0.00018;
  keyLight.shadow.normalBias = 0.018;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xbfd8ff, 0.62);
  fillLight.position.set(-1.6, 1.4, 2.1);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x8bded4, 1.35);
  rimLight.position.set(-2.2, 1.55, -1.55);
  scene.add(rimLight);

  const eyeLight = new THREE.PointLight(0xdffcff, 1.25, 4.2, 2);
  eyeLight.position.set(0, 1.42, 1.65);
  scene.add(eyeLight);

  const floorMaterial = new THREE.ShadowMaterial({
    color: 0x05070a,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });
  const floorShadow = new THREE.Mesh(new THREE.CircleGeometry(0.86, 64), floorMaterial);
  floorShadow.rotation.x = -Math.PI / 2;
  floorShadow.position.set(0, 0.004, -0.04);
  floorShadow.scale.set(1.28, 0.56, 1);
  floorShadow.receiveShadow = true;
  scene.add(floorShadow);

  const softBlob = new THREE.Mesh(
    new THREE.CircleGeometry(0.76, 64),
    new THREE.MeshBasicMaterial({
      color: 0x04060a,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  softBlob.rotation.x = -Math.PI / 2;
  softBlob.position.set(0, 0.006, -0.03);
  softBlob.scale.set(1.42, 0.48, 1);
  scene.add(softBlob);

  loader.crossOrigin = "anonymous";
  loader.register((parser) => new VRMLoaderPlugin(parser));

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const aspect = width / height;

    camera.aspect = aspect;
    const target = desiredCameraPlacement(aspect);
    if (!currentVrm) {
      camera.position.set(target.x, target.y, target.z);
      camera.fov = target.fov;
      camera.lookAt(target.lookX, target.lookY, target.lookZ);
      springs.cameraX.reset(target.x);
      springs.cameraY.reset(target.y);
      springs.cameraZ.reset(target.z);
      springs.cameraLookY.reset(target.lookY);
      springs.cameraFov.reset(target.fov);
    }
    camera.updateProjectionMatrix();
    lastCameraProjection = { aspect: camera.aspect, fov: camera.fov, near: camera.near, far: camera.far };
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

  function setStageReady(isReady) {
    container.dataset.avatarReady = isReady ? "true" : "false";
    motion.introTarget = isReady ? 1 : 0;
  }

  function desiredCameraPlacement(aspect = camera.aspect) {
    if (!modelMetrics?.stageBounds) {
      const fallbackHeight = options.modelHeight || 1.72;
      const fallbackFov = framing.fov;
      const fallbackDistance = fallbackHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fallbackFov) * 0.5));
      return { x: 0, y: fallbackHeight * 0.5, z: fallbackDistance, lookX: 0, lookY: fallbackHeight * 0.5, lookZ: 0, fov: fallbackFov };
    }

    const min = new THREE.Vector3().fromArray(modelMetrics.stageBounds.min);
    const max = new THREE.Vector3().fromArray(modelMetrics.stageBounds.max);
    const center = new THREE.Vector3().fromArray(modelMetrics.stageCenter);
    center.x = modelMetrics.hipsX;
    const bodyAspect = modelMetrics.stageHeight / Math.max(modelMetrics.stageWidth, 0.001);
    const fov = clamp(framing.fov + (aspect < 0.78 ? 2 : 0) + clamp((bodyAspect - 1.7) * 1.2, 0, 3), 28, 36);
    const verticalHalfAngle = THREE.MathUtils.degToRad(fov * 0.5);
    const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * Math.max(aspect, 0.1));
    const verticalDistance = (modelMetrics.stageHeight * CAMERA_FRAMING.bodyMargin) / (2 * Math.tan(verticalHalfAngle));
    const horizontalRadius = Math.max(Math.abs(max.x - center.x), Math.abs(min.x - center.x));
    const horizontalDistance = (horizontalRadius * CAMERA_FRAMING.widthMargin) / Math.tan(horizontalHalfAngle);
    const distance = Math.max(verticalDistance, horizontalDistance) + modelMetrics.stageDepth * 0.56;

    return {
      x: center.x,
      y: center.y,
      z: max.z + distance,
      lookX: center.x,
      lookY: center.y,
      lookZ: center.z,
      fov,
    };
  }

  function currentImpact(elapsed) {
    const age = elapsed - impact.startedAt;
    if (age < 0 || age >= impact.duration || impact.duration <= 0) {
      return { x: 0, y: 0, fov: 0 };
    }
    const progress = age / impact.duration;
    // A squared envelope removes the shake quickly while the high-frequency
    // sine creates a crisp anime hit instead of a slow camera drift.
    const decay = (1 - progress) ** 2;
    const frequency = 68;
    const phase = age * frequency;
    return {
      x: Math.sin(phase * 1.17) * impact.intensity * 0.035 * decay,
      y: Math.cos(phase * 0.91) * impact.intensity * 0.026 * decay,
      fov: impact.intensity * 3.4 * decay,
    };
  }

  function updateImpactStretch(delta) {
    impact.stretches.forEach((stretch, bone) => {
      // Exponential lerp is frame-rate independent: the visible return stays
      // equally smooth at 30 Hz and 120 Hz.
      const alpha = 1 - Math.exp(-stretch.returnSpeed * delta);
      bone.scale.y = THREE.MathUtils.lerp(bone.scale.y, stretch.baseY, alpha);
      if (Math.abs(bone.scale.y - stretch.baseY) < 0.001) {
        bone.scale.y = stretch.baseY;
        impact.stretches.delete(bone);
      }
    });
  }

  function updateCamera(delta, elapsed) {
    const target = desiredCameraPlacement();
    const hit = currentImpact(elapsed);
    camera.position.set(
      springs.cameraX.update(target.x, delta) + hit.x,
      springs.cameraY.update(target.y, delta) + hit.y,
      springs.cameraZ.update(target.z, delta),
    );
    camera.fov = springs.cameraFov.update(target.fov, delta) + hit.fov;
    camera.near = clamp(target.z * 0.025, 0.01, 0.12);
    camera.far = Math.max(20, target.z + modelMetrics?.stageHeight + 5);
    camera.lookAt(target.lookX, springs.cameraLookY.update(target.lookY, delta), target.lookZ);
    if (
      !lastCameraProjection ||
      Math.abs(lastCameraProjection.aspect - camera.aspect) > 0.0001 ||
      Math.abs(lastCameraProjection.fov - camera.fov) > 0.01 ||
      Math.abs(lastCameraProjection.near - camera.near) > 0.0001 ||
      Math.abs(lastCameraProjection.far - camera.far) > 0.01
    ) {
      camera.updateProjectionMatrix();
      lastCameraProjection = { aspect: camera.aspect, fov: camera.fov, near: camera.near, far: camera.far };
    }
  }

  function resetMotionState() {
    motion.speaking = false;
    motion.audioLevel = 0;
    motion.audioLevelTarget = 0;
    motion.speechIntensity = 0;
    motion.engagementTarget = 0.42;
    motion.mouthShape = "rest";
    motion.mouthTarget = 0;
    motion.mouthValue = 0;
    motion.mouthPulseValue = 0;
    motion.mouthPulseTarget = 0;
    motion.emotion = "relaxed";
    motion.gestureMode = "calm";
    motion.gestureIntensity = 0.38;
    motion.gestureSeed = randomBetween(0, Math.PI * 2);
    motion.speechStartTime = clock.elapsedTime;
    motion.lastCueAt = -10;
    motion.cueStrength = 0;
    motion.cueMode = "calm";
    motion.cueNod = 0;
    motion.cueShake = 0;
    motion.blinkStartedAt = -10;
    motion.blinkHold = 0;
    motion.pendingDoubleBlink = false;
    motion.blinkSide = "both";
    motion.blinkEmotionBias = 0;
    motion.nextBlinkAt = clock.elapsedTime + Math.max(0.5, options.initialBlinkDelayMs ?? 0.7);
    motion.gazeX = 0;
    motion.gazeY = 0;
    motion.gazeTargetX = 0;
    motion.gazeTargetY = 0;
    motion.gazeHoldUntil = 0;
    motion.attentionX = 0;
    motion.attentionY = 0;
    motion.attentionLostUntil = 0;
    motion.nextAttentionAt = clock.elapsedTime + randomBetween(1.4, 3.2);
    motion.nextGazeShift = clock.elapsedTime + 0.8;
    motion.nextListenNodAt = clock.elapsedTime + randomBetween(1.5, 3.6);
    motion.listenNodStartedAt = -10;
    motion.listenNodDuration = 0;
    motion.listenNodStrength = 0;
    motion.actionMode = "none";
    motion.actionStartedAt = -10;
    motion.actionDuration = 0;
    motion.actionStrength = 0;
    motion.actionPriority = 0;
    motion.actionCooldownUntil = 0;
    motion.nextIdleActionAt = clock.elapsedTime + randomBetween(5.5, 8);
    Object.keys(motion.expressionWeights).forEach((name) => {
      motion.expressionWeights[name] = 0;
    });
    Object.values(springs).forEach((spring) => spring.reset?.(0));
    Object.values(motion.rigSprings).forEach((spring) => spring.reset?.());
  }

  function clearCurrentModel() {
    window.clearTimeout(greetingTimer);
    greetingTimer = 0;
    setStageReady(false);

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
    modelMetrics = null;
    lastDiagnostics = null;
  }

  function prepareVrm(vrm) {
    const diagnostics = {
      renderer: {
        pixelRatio: renderer.getPixelRatio(),
        outputColorSpace: renderer.outputColorSpace,
        toneMapping: renderer.toneMapping,
        exposure: renderer.toneMappingExposure,
        maxTextureSize: renderer.capabilities.maxTextureSize,
        maxAnisotropy: renderer.capabilities.getMaxAnisotropy?.() || 1,
        shadowMap: "PCFSoftShadowMap 2048",
      },
      vrm: {
        materials: 0,
        meshes: 0,
        skinnedMeshes: 0,
      },
      textures: [],
      fixes: [
        "Skipped VRMUtils mesh/morph combination to preserve original material and expression fidelity.",
        "Applied explicit sRGB color space to color textures and NoColorSpace to data textures.",
        "Enabled high anisotropy and mipmapped linear filtering for VRM textures.",
        "Preserved MToon/toon material parameters instead of replacing roughness or shading values.",
        "Applied automatic ground alignment after scale and rotation.",
        "Enabled soft contact shadows and smooth companion camera framing.",
      ],
    };

    vrm.scene.traverse((object) => {
      object.frustumCulled = false;
      if (object.isMesh || object.isSkinnedMesh) {
        diagnostics.vrm.meshes += 1;
        diagnostics.vrm.skinnedMeshes += object.isSkinnedMesh ? 1 : 0;
        object.castShadow = true;
        object.receiveShadow = false;
      }
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach((material) => {
        diagnostics.vrm.materials += 1;
        configureVrmMaterial(material, renderer, diagnostics);
      });
    });

    modelMetrics = fitModelToStage(vrm);
    lastDiagnostics = { ...diagnostics, modelMetrics };
    console.info("Emora VRM diagnostics", lastDiagnostics);
    resetMotionState();
    motion.stanceSeed = randomBetween(0, Math.PI * 2);
    modelRoot.position.set(0, 0, 0);
    modelRoot.rotation.set(0, 0, 0);

    bones = Object.fromEntries(Object.entries(BONE_NAMES).map(([label, boneName]) => [label, getBone(vrm, boneName)]));
    baseRotations = captureBaseRotations(bones);
    motion.rigTargets = {};
    motion.rigSprings = Object.fromEntries(
      Object.keys(bones).map((name) => [
        name,
        new EulerSpring({
          frequency: name === "head" ? 5.8 : name === "neck" ? 4.8 : name.includes("Hand") ? 6.5 : 4.2,
          damping: name === "head" || name === "neck" ? 0.9 : 1,
        }),
      ]),
    );

    if (vrm.lookAt) {
      vrm.lookAt.autoUpdate = true;
      vrm.lookAt.target = gazeTarget;
    }
    resize();
  }

  function applyNeutralPose() {
    if (!baseRotations || !Object.keys(baseRotations).length) {
      return;
    }

    const neutralPose = {
      hips: [0.006, 0.012, 0.018],
      head: [-0.012, 0.01, -0.006],
      neck: [0.004, 0.006, -0.004],
      upperChest: [0.026, -0.006, -0.008],
      chest: [0.02, -0.004, -0.006],
      spine: [0.012, 0.006, 0.006],
      leftShoulder: [0.018, 0.006, 0.028],
      rightShoulder: [0.012, -0.006, -0.02],
      leftUpperArm: [0.28, 0.035, 1.18],
      rightUpperArm: [0.24, -0.025, -1.2],
      leftLowerArm: [0.54, -0.04, 0.12],
      rightLowerArm: [0.5, 0.032, -0.1],
      leftHand: [0.025, -0.018, 0.018],
      rightHand: [0.018, 0.016, -0.014],
      leftUpperLeg: [0.012, 0.012, 0.02],
      rightUpperLeg: [-0.006, -0.01, -0.018],
      leftLowerLeg: [-0.006, 0, -0.008],
      rightLowerLeg: [0.008, 0, 0.006],
      leftFoot: [-0.012, 0.006, 0.01],
      rightFoot: [0.01, -0.006, -0.008],
    };

    Object.entries(neutralPose).forEach(([name, offsets]) => {
      const bone = bones[name];
      const base = baseRotations[name];
      if (!bone || !base) {
        return;
      }
      bone.rotation.set(base.x + offsets[0], base.y + offsets[1], base.z + offsets[2]);
    });
  }

  function setRigTarget(name, x = 0, y = 0, z = 0) {
    motion.rigTargets[name] = { x, y, z };
  }

  function applyRigTarget(name, delta) {
    const spring = motion.rigSprings[name];
    const target = motion.rigTargets[name] || { x: 0, y: 0, z: 0 };
    const value = spring ? spring.update(target, delta) : target;
    applyBoneRotation(bones[name], baseRotations[name], value.x, value.y, value.z);
  }

  function setMouth(shape = "rest") {
    motion.mouthShape = VISEME_EXPRESSIONS[shape] ? shape : "open";
    motion.mouthTarget = motion.mouthShape === "rest" ? 0 : 1;
  }

  function currentActionState(elapsed = clock.elapsedTime) {
    const age = elapsed - motion.actionStartedAt;
    const progress = actionProgress(age, motion.actionDuration);
    const pulse = smoothPulse(age, motion.actionDuration) * motion.actionStrength;
    return { age, progress, pulse };
  }

  function triggerAction(mode = "none", strength = 0.5, duration = 1.6, options = {}) {
    const now = clock.elapsedTime;
    const priority = ACTION_PRIORITIES[mode] ?? 1;
    const current = currentActionState(now);
    const minGap = options.minGap ?? 0.75;

    if (!options.force) {
      if (now < motion.actionCooldownUntil) {
        return false;
      }

      if (current.pulse > 0.22 && priority < motion.actionPriority + 1) {
        return false;
      }
    }

    motion.actionMode = mode;
    motion.actionStartedAt = now;
    motion.actionDuration = duration;
    motion.actionStrength = clamp(strength, 0, 1);
    motion.actionSeed = randomBetween(0, Math.PI * 2);
    motion.actionPriority = priority;
    motion.actionCooldownUntil = now + minGap;
    return true;
  }

  function greet(mode = "wave") {
    if (!currentVrm) {
      return false;
    }

    motion.emotion = "happy";
    motion.nextIdleActionAt = clock.elapsedTime + randomBetween(6, 9);
    return triggerAction(mode, mode === "wave" ? 1 : 0.82, mode === "wave" ? 2.35 : 2.1, {
      force: true,
      minGap: 1.4,
    });
  }

  function blinkValueForElapsed(elapsed) {
    if (elapsed >= motion.nextBlinkAt) {
      motion.blinkStartedAt = elapsed;
      const isLongBlink = motion.thinking && Math.random() > 0.72;
      motion.blinkDuration = isLongBlink ? randomBetween(0.22, 0.34) : randomBetween(0.105, 0.18);
      motion.blinkHold = isLongBlink ? randomBetween(0.04, 0.12) : 0;
      motion.pendingDoubleBlink = !isLongBlink && Math.random() > (motion.speaking ? 0.82 : 0.9);
      motion.blinkSide = Math.random() > 0.94 ? (Math.random() > 0.5 ? "left" : "right") : "both";
      motion.blinkEmotionBias = motion.emotion === "happy" ? 0.08 : motion.emotion === "sad" ? 0.16 : 0;
      const speechMin = motion.speaking ? 1.28 : 2.05;
      const speechMax = motion.speaking ? 3.05 : 5.25;
      motion.nextBlinkAt = elapsed + randomBetween(speechMin, speechMax) - motion.blinkEmotionBias;
    }

    const blinkWindow = motion.blinkDuration + motion.blinkHold;
    const progress = (elapsed - motion.blinkStartedAt) / Math.max(0.001, blinkWindow);
    if (progress < 0 || progress > 1) {
      if (motion.pendingDoubleBlink && progress > 1 && progress < 1.55) {
        motion.pendingDoubleBlink = false;
        motion.nextBlinkAt = elapsed + randomBetween(0.08, 0.18);
      }
      return 0;
    }

    if (motion.blinkHold > 0 && progress > 0.42 && progress < 0.62) {
      return 1;
    }

    return Math.pow(Math.sin(progress * Math.PI), 0.42);
  }

  function updateGaze(delta, elapsed) {
    if (elapsed >= motion.nextAttentionAt) {
      const attentionScale = motion.listening ? 0.035 : motion.speaking ? 0.055 : 0.075;
      motion.attentionX = randomBetween(-attentionScale, attentionScale);
      motion.attentionY = randomBetween(-attentionScale * 0.7, attentionScale * 0.65);
      motion.attentionLostUntil = Math.random() > 0.8 ? elapsed + randomBetween(0.45, 1.1) : 0;
      motion.nextAttentionAt = elapsed + randomBetween(motion.speaking ? 1.1 : 2.4, motion.speaking ? 2.7 : 5.6);
    }

    if (elapsed >= motion.nextGazeShift) {
      const focusWidth = motion.listening ? 0.04 : motion.speaking ? 0.09 : 0.13;
      const focusHeight = motion.speaking ? 0.07 : 0.055;
      const thinkingDrop = motion.thinking && !motion.speaking ? -0.13 : 0;
      const saccade = Math.random() > 0.7 ? randomBetween(-0.04, 0.04) : 0;

      motion.gazeTargetX = randomBetween(-focusWidth, focusWidth) + motion.attentionX + saccade;
      motion.gazeTargetY = randomBetween(-focusHeight, focusHeight) + thinkingDrop + motion.attentionY;
      motion.gazeHoldUntil = elapsed + randomBetween(0.18, motion.listening ? 0.85 : 1.25);
      motion.nextGazeShift = motion.gazeHoldUntil + randomBetween(motion.speaking ? 0.22 : 0.55, motion.speaking ? 1.0 : 2.5);
    }

    const targetLoss = elapsed < motion.attentionLostUntil ? 1 : 0;
    const microX = smoothNoise(motion.stanceSeed + 12.4, elapsed * 2.9) * (motion.listening ? 0.006 : 0.012);
    const microY = smoothNoise(motion.stanceSeed + 19.8, elapsed * 2.5) * (motion.listening ? 0.004 : 0.009);
    const finalGazeX = motion.gazeTargetX * (1 - targetLoss * 0.4) + microX;
    const finalGazeY = motion.gazeTargetY * (1 - targetLoss * 0.55) + microY - targetLoss * 0.04;

    motion.gazeX = springs.gazeX.update(finalGazeX, delta);
    motion.gazeY = springs.gazeY.update(finalGazeY, delta);
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
    const microSmile = smoothNoise(motion.stanceSeed + 31.2, elapsed * 0.42) * 0.018;
    const microCuriosity = smoothNoise(motion.stanceSeed + 37.6, elapsed * 0.36) * 0.012;
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
    } else if (motion.emotion === "excited") {
      targets.happy = motion.speaking ? 0.3 : 0.2;
      targets.surprised = 0.08;
      targets.relaxed = 0.08;
    } else if (motion.emotion === "comforting") {
      targets.happy = 0.06;
      targets.relaxed = motion.speaking ? 0.2 : 0.24;
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
    } else if (motion.emotion === "embarrassed") {
      targets.happy = 0.07;
      targets.surprised = 0.05;
      targets.relaxed = 0.12;
    } else if (motion.emotion === "sleepy") {
      targets.relaxed = 0.24;
      targets.sad = 0.025;
    } else if (motion.emotion === "confident") {
      targets.relaxed = 0.1;
      targets.angry = 0.02;
    }

    targets.happy = clamp(targets.happy + Math.max(0, microSmile), 0, 0.34);
    targets.surprised = clamp(targets.surprised + Math.max(0, microCuriosity), 0, 0.16);
    return targets;
  }

  function updateExpressions(delta, elapsed) {
    if (!currentVrm?.expressionManager) {
      return;
    }

    const manager = currentVrm.expressionManager;
    const mouthSpeed = motion.speaking ? 13 : 9;
    const blink = blinkValueForElapsed(elapsed);
    motion.audioLevel = dampedBlend(motion.audioLevel, motion.audioLevelTarget, delta, motion.speaking ? 0.055 : 0.12);
    motion.mouthPulseTarget = motion.speaking
      ? (0.22 +
          0.58 * motion.audioLevel +
          0.16 * Math.sin(elapsed * 10.5 + motion.gestureSeed) +
          0.14 * Math.sin(elapsed * 16.2 + 0.7) ** 2) *
        motion.speechEnergy
      : 0;
    motion.mouthPulseValue = springs.mouth.update(motion.mouthPulseTarget, delta);
    const mouthPulse = motion.speaking ? clamp(motion.mouthPulseValue, 0.12, 0.98) : 1;
    const emotionWeights = emotionTargets(elapsed);

    motion.mouthValue += (motion.mouthTarget - motion.mouthValue) * Math.min(1, delta * mouthSpeed);

    MOUTH_EXPRESSIONS.forEach((name) => setExpression(manager, name, 0));
    VISEME_EXPRESSIONS[motion.mouthShape].forEach((name) => {
      setExpression(manager, name, clamp(motion.mouthValue * mouthPulse));
    });

    [...BLINK_EXPRESSIONS.both, ...BLINK_EXPRESSIONS.left, ...BLINK_EXPRESSIONS.right].forEach((name) => {
      setExpression(manager, name, 0);
    });
    if (motion.blinkSide === "both") {
      if (!setFirstExpression(manager, BLINK_EXPRESSIONS.both, clamp(blink))) {
        setFirstExpression(manager, BLINK_EXPRESSIONS.left, clamp(blink));
        setFirstExpression(manager, BLINK_EXPRESSIONS.right, clamp(blink));
      }
    } else {
      setFirstExpression(manager, BLINK_EXPRESSIONS[motion.blinkSide], clamp(blink * 0.92));
    }

    const { pulse: actionPulse } = currentActionState(elapsed);
    if (motion.actionMode === "wave" || motion.actionMode === "sparkle") {
      setFirstExpression(manager, BLINK_EXPRESSIONS.left, clamp(actionPulse * 0.78));
    }

    applyLookExpressionFallback(manager);

    EMOTION_EXPRESSION_NAMES.forEach((name) => setExpression(manager, name, 0));
    Object.entries(emotionWeights).forEach(([name, target]) => {
      motion.expressionWeights[name] = dampedBlend(motion.expressionWeights[name] || 0, target, delta, 0.16);
      setFirstExpression(manager, EMOTION_EXPRESSIONS[name], clamp(motion.expressionWeights[name], 0, 0.32));
    });

    // These are optional VRM expression names. Standard VRMs retain their
    // normal happy/surprised blend, while richer models gain cheek, brow, and
    // squint detail without sacrificing compatibility.
    const cheek = clamp((motion.expressionWeights.happy || 0) * 0.2, 0, 0.08);
    const browRaise = clamp((motion.expressionWeights.surprised || 0) * 0.55, 0, 0.1);
    const squint = clamp(cheek + (motion.emotion === "sleepy" ? 0.05 : 0), 0, 0.1);
    CHEEK_EXPRESSIONS.forEach((name) => setExpression(manager, name, 0));
    BROW_RAISE_EXPRESSIONS.forEach((name) => setExpression(manager, name, 0));
    SQUINT_EXPRESSIONS.forEach((name) => setExpression(manager, name, 0));
    setFirstExpression(manager, CHEEK_EXPRESSIONS, cheek);
    setFirstExpression(manager, BROW_RAISE_EXPRESSIONS, browRaise);
    if (blink < 0.08 && !setFirstExpression(manager, SQUINT_EXPRESSIONS, squint)) {
      setFirstExpression(manager, BLINK_EXPRESSIONS.left, squint * 0.46);
      setFirstExpression(manager, BLINK_EXPRESSIONS.right, squint * 0.46);
    }

    if (motion.actionMode === "wave" || motion.actionMode === "sparkle" || motion.actionMode === "cheer") {
      setFirstExpression(manager, EMOTION_EXPRESSIONS.happy, clamp(0.18 + actionPulse * 0.38, 0, 0.62));
    } else if (motion.actionMode === "shy") {
      setFirstExpression(manager, EMOTION_EXPRESSIONS.happy, clamp(actionPulse * 0.24, 0, 0.42));
      setFirstExpression(manager, EMOTION_EXPRESSIONS.surprised, clamp(actionPulse * 0.08, 0, 0.2));
    } else if (motion.actionMode === "heart") {
      setFirstExpression(manager, EMOTION_EXPRESSIONS.relaxed, clamp(0.16 + actionPulse * 0.22, 0, 0.45));
      setFirstExpression(manager, EMOTION_EXPRESSIONS.happy, clamp(actionPulse * 0.16, 0, 0.32));
    }
  }

  function updateRig(delta, elapsed) {
    const talk = motion.speaking ? 1 : 0;
    const listening = motion.listening && !motion.speaking ? 1 : 0;
    const thinking = motion.thinking && !motion.speaking ? 1 : 0;
    const engagement = springs.engagement.update(motion.engagementTarget, delta);
    const breath = Math.sin(elapsed * 1.38 + motion.stanceSeed);
    const breathLift = 0.5 + 0.5 * breath;
    const sway = Math.sin(elapsed * 0.48 + motion.stanceSeed);
    const slowSway = Math.sin(elapsed * 0.26 + motion.stanceSeed * 0.7);
    const weightShift = Math.sin(elapsed * 0.34 + motion.stanceSeed);
    const postureNoise = smoothNoise(motion.stanceSeed + 4.1, elapsed * 0.21);
    const chestNoise = smoothNoise(motion.stanceSeed + 8.6, elapsed * 0.32);
    const shoulderNoise = smoothNoise(motion.stanceSeed + 14.9, elapsed * 0.46);
    const headMicroX = smoothNoise(motion.stanceSeed + 21.2, elapsed * 1.25) * 0.012;
    const headMicroY = smoothNoise(motion.stanceSeed + 22.5, elapsed * 1.12) * 0.014;
    const headMicroZ = smoothNoise(motion.stanceSeed + 23.7, elapsed * 0.98) * 0.01;
    const speechElapsed = Math.max(0, elapsed - motion.speechStartTime);
    const beat =
      Math.sin(speechElapsed * motion.gestureTempo + motion.gestureSeed) * 0.58 +
      Math.sin(speechElapsed * 1.55 + motion.gestureSeed * 0.4) * 0.42;
    const alternateBeat =
      Math.sin(speechElapsed * motion.gestureTempo * 0.88 + motion.gestureSeed + Math.PI * 0.82) * 0.58 +
      Math.sin(speechElapsed * 1.32 + motion.gestureSeed) * 0.42;
    const beatPulse = Math.pow(Math.max(0, beat), 1.8);
    const cueAge = elapsed - motion.lastCueAt;
    const cue = cueAge >= 0 && cueAge < 0.95 ? (1 - cueAge / 0.95) * motion.cueStrength : 0;
    const action = currentActionState(elapsed);
    const actionAge = action.age;
    const actionPulse = action.pulse;
    const actionProgressValue = action.progress;
    const gesture = talk * motion.gestureIntensity * (0.16 + 0.48 * Math.max(beatPulse, cue));
    const gestureMode = cue > 0.18 ? motion.cueMode : motion.gestureMode;
    const talkNod =
      (Math.sin(speechElapsed * 3.7) * 0.58 + Math.sin(speechElapsed * 6.1 + 1.1) * 0.42) * talk * motion.speechEnergy;
    const cueNod = cue * motion.cueNod;
    const cueShake = cue * motion.cueShake * Math.sin(cueAge * 18);
    if (listening && elapsed >= motion.nextListenNodAt) {
      motion.listenNodStartedAt = elapsed;
      motion.listenNodDuration = randomBetween(0.72, 1.08);
      motion.listenNodStrength = randomBetween(0.34, 0.58);
      motion.nextListenNodAt = elapsed + randomBetween(3.4, 7.6);
    }
    const listenNod =
      listening && motion.listenNodDuration > 0
        ? smoothPulse(elapsed - motion.listenNodStartedAt, motion.listenNodDuration) * motion.listenNodStrength
        : 0;
    const listenLean = listening * (0.032 + 0.024 * engagement);
    const thinkingDrop = thinking * 0.065 + (motion.emotion === "sleepy" ? 0.02 : 0);
    const curiousTilt = motion.emotion === "curious" ? 0.025 * talk : 0;
    const emotionTilt = motion.emotion === "embarrassed" ? 0.025 : motion.emotion === "comforting" ? -0.012 : 0;
    const audioDrive = motion.audioLevel * talk;
    const bodyLeanX = 0.01 * slowSway + 0.007 * postureNoise + 0.012 * talk * Math.sin(speechElapsed * 1.05 + motion.gestureSeed) - 0.012 * engagement * (talk + listening);
    const bodyLeanZ = 0.014 * weightShift + 0.008 * postureNoise + 0.01 * talk * Math.sin(speechElapsed * 0.86 + motion.gestureSeed);
    const bodyRise = 0.006 * breathLift + 0.004 * audioDrive + 0.003 * talk * Math.max(0, Math.sin(speechElapsed * 1.9));

    modelRoot.position.x = springs.modelX.update(bodyLeanX, delta);
    modelRoot.position.y = springs.modelY.update(bodyRise, delta);
    modelRoot.rotation.z = springs.modelRotZ.update(bodyLeanZ, delta);

    let leftUpperX = 0.2 + 0.018 * breath - 0.008 * weightShift + 0.01 * shoulderNoise;
    let leftUpperY = 0.018 + 0.008 * slowSway + 0.005 * postureNoise;
    let leftUpperZ = 1.34 + 0.018 * sway + 0.007 * shoulderNoise;
    let rightUpperX = 0.19 + 0.016 * breath + 0.008 * weightShift - 0.01 * shoulderNoise;
    let rightUpperY = -0.018 + 0.008 * slowSway + 0.005 * postureNoise;
    let rightUpperZ = -1.35 - 0.018 * sway - 0.007 * shoulderNoise;
    let leftLowerX = 0.43 + 0.014 * Math.sin(elapsed * 0.74 + motion.stanceSeed);
    let leftLowerY = -0.02 + 0.008 * slowSway;
    let leftLowerZ = 0.07 + 0.01 * weightShift;
    let rightLowerX = 0.42 + 0.014 * Math.sin(elapsed * 0.7 + motion.stanceSeed + 0.9);
    let rightLowerY = 0.02 + 0.008 * slowSway;
    let rightLowerZ = -0.07 + 0.01 * weightShift;
    let leftHandX = 0.016 * Math.sin(elapsed * 1.1);
    let leftHandY = 0.012 * Math.sin(elapsed * 0.8);
    let leftHandZ = 0.018 * Math.sin(elapsed * 0.9);
    let rightHandX = 0.016 * Math.sin(elapsed * 1.05);
    let rightHandY = -0.012 * Math.sin(elapsed * 0.82);
    let rightHandZ = -0.018 * Math.sin(elapsed * 0.94);
    let actionNod = 0;
    let actionHeadTurn = 0;
    let actionHeadTilt = 0;

    if (!motion.speaking && !motion.listening && elapsed >= motion.nextIdleActionAt) {
      triggerAction("idleShift", randomBetween(0.28, 0.42), randomBetween(1.5, 2.2), { minGap: 2.2 });
      motion.nextIdleActionAt = elapsed + randomBetween(8, 15);
    }

    if (gestureMode === "bright") {
      leftUpperX -= 0.085 * gesture;
      rightUpperX -= 0.075 * gesture;
      leftUpperY += 0.05 * gesture;
      rightUpperY -= 0.05 * gesture;
      leftUpperZ += 0.07 * gesture;
      rightUpperZ -= 0.08 * gesture;
      leftLowerX += 0.12 * gesture + 0.02 * beat * talk;
      rightLowerX += 0.13 * gesture + 0.02 * alternateBeat * talk;
      leftHandZ += 0.1 * gesture + 0.024 * beat;
      rightHandZ -= 0.11 * gesture + 0.024 * alternateBeat;
    } else if (gestureMode === "question") {
      leftUpperX -= 0.055 * gesture;
      rightUpperX -= 0.055 * gesture;
      leftUpperY += 0.08 * gesture;
      rightUpperY -= 0.08 * gesture;
      leftLowerX += 0.15 * gesture;
      rightLowerX += 0.16 * gesture;
      leftLowerZ += 0.04 * gesture;
      rightLowerZ -= 0.04 * gesture;
      leftHandX += 0.1 * gesture;
      rightHandX += 0.1 * gesture;
      leftHandZ += 0.09 * gesture;
      rightHandZ -= 0.09 * gesture;
    } else if (gestureMode === "soothe") {
      const softWave = 0.5 + 0.5 * Math.sin(speechElapsed * 2.4 + motion.gestureSeed);
      leftUpperX += 0.035 * gesture;
      rightUpperX += 0.035 * gesture;
      leftUpperY += 0.025 * gesture;
      rightUpperY -= 0.025 * gesture;
      leftLowerX += 0.09 * gesture * softWave;
      rightLowerX += 0.09 * gesture * softWave;
      leftLowerZ -= 0.03 * gesture;
      rightLowerZ += 0.03 * gesture;
      leftHandY += 0.08 * gesture * softWave;
      rightHandY -= 0.08 * gesture * softWave;
    } else if (gestureMode === "firm") {
      leftUpperX -= 0.045 * gesture;
      rightUpperX -= 0.045 * gesture;
      leftLowerX += 0.1 * gesture + 0.024 * Math.max(0, beat);
      rightLowerX += 0.1 * gesture + 0.024 * Math.max(0, alternateBeat);
      leftHandX += 0.05 * gesture;
      rightHandX += 0.05 * gesture;
    } else {
      const leftExplain = gesture * (0.55 + 0.45 * Math.max(0, beat));
      const rightExplain = gesture * (0.55 + 0.45 * Math.max(0, alternateBeat));
      leftUpperX -= 0.05 * leftExplain;
      rightUpperX -= 0.05 * rightExplain;
      leftUpperY += 0.04 * leftExplain;
      rightUpperY -= 0.04 * rightExplain;
      leftLowerX += 0.1 * leftExplain;
      rightLowerX += 0.1 * rightExplain;
      leftHandZ += 0.06 * leftExplain;
      rightHandZ -= 0.065 * rightExplain;
    }

    if (motion.actionMode === "wave") {
      const wave = Math.sin(actionAge * 12.8 + motion.actionSeed) * actionPulse;
      rightUpperX -= 0.78 * actionPulse;
      rightUpperY -= 0.34 * actionPulse;
      rightUpperZ -= 0.56 * actionPulse;
      rightLowerX += 0.92 * actionPulse;
      rightLowerY -= 0.18 * actionPulse;
      rightLowerZ -= 0.52 * actionPulse;
      rightHandX += 0.18 * actionPulse;
      rightHandY -= 0.44 * actionPulse;
      rightHandZ += 0.38 * wave;
      actionNod += 0.072 * actionPulse + 0.018 * wave;
      actionHeadTurn -= 0.03 * actionPulse;
      actionHeadTilt -= 0.055 * actionPulse;
    } else if (motion.actionMode === "sparkle") {
      const sparkle = Math.sin(actionAge * 10.8 + motion.actionSeed) * actionPulse;
      leftUpperX -= 0.3 * actionPulse;
      rightUpperX -= 0.28 * actionPulse;
      leftUpperY += 0.18 * actionPulse;
      rightUpperY -= 0.18 * actionPulse;
      leftUpperZ += 0.12 * actionPulse;
      rightUpperZ -= 0.12 * actionPulse;
      leftLowerX += 0.48 * actionPulse;
      rightLowerX += 0.48 * actionPulse;
      leftLowerZ += 0.12 * actionPulse;
      rightLowerZ -= 0.12 * actionPulse;
      leftHandZ += 0.28 * actionPulse + 0.08 * sparkle;
      rightHandZ -= 0.28 * actionPulse - 0.08 * sparkle;
      modelRoot.position.y = approach(modelRoot.position.y, bodyRise + 0.032 * actionPulse, delta, 6.2);
      actionNod += 0.055 * actionPulse;
    } else if (motion.actionMode === "cheer") {
      const bounce = Math.sin(actionProgressValue * Math.PI * 2) * actionPulse;
      leftUpperX -= 0.58 * actionPulse;
      rightUpperX -= 0.55 * actionPulse;
      leftUpperY += 0.24 * actionPulse;
      rightUpperY -= 0.24 * actionPulse;
      leftUpperZ += 0.18 * actionPulse;
      rightUpperZ -= 0.18 * actionPulse;
      leftLowerX += 0.7 * actionPulse;
      rightLowerX += 0.7 * actionPulse;
      leftHandY += 0.18 * actionPulse;
      rightHandY -= 0.18 * actionPulse;
      leftHandZ += 0.2 * actionPulse;
      rightHandZ -= 0.2 * actionPulse;
      modelRoot.position.y = approach(modelRoot.position.y, bodyRise + 0.04 * actionPulse + 0.012 * bounce, delta, 6.5);
      actionNod += 0.08 * actionPulse;
    } else if (motion.actionMode === "shy") {
      const tinySway = Math.sin(actionAge * 4.8 + motion.actionSeed) * actionPulse;
      leftUpperX += 0.08 * actionPulse;
      rightUpperX += 0.08 * actionPulse;
      leftUpperY += 0.08 * actionPulse;
      rightUpperY -= 0.08 * actionPulse;
      leftLowerX += 0.36 * actionPulse;
      rightLowerX += 0.34 * actionPulse;
      leftLowerZ -= 0.22 * actionPulse;
      rightLowerZ += 0.22 * actionPulse;
      leftHandY += 0.18 * actionPulse;
      rightHandY -= 0.18 * actionPulse;
      leftHandZ -= 0.08 * actionPulse;
      rightHandZ += 0.08 * actionPulse;
      actionNod += 0.075 * actionPulse;
      actionHeadTurn += 0.035 * tinySway;
      actionHeadTilt += 0.085 * actionPulse;
    } else if (motion.actionMode === "heart") {
      const soften = smoothStep(actionProgressValue) * actionPulse;
      leftUpperX -= 0.16 * actionPulse;
      rightUpperX -= 0.16 * actionPulse;
      leftUpperY += 0.18 * actionPulse;
      rightUpperY -= 0.18 * actionPulse;
      leftLowerX += 0.5 * actionPulse;
      rightLowerX += 0.5 * actionPulse;
      leftLowerZ -= 0.34 * actionPulse;
      rightLowerZ += 0.34 * actionPulse;
      leftHandY += 0.22 * actionPulse;
      rightHandY -= 0.22 * actionPulse;
      leftHandZ -= 0.08 * actionPulse;
      rightHandZ += 0.08 * actionPulse;
      modelRoot.rotation.z = approach(modelRoot.rotation.z, bodyLeanZ - 0.03 * soften, delta, 4.5);
      actionNod += 0.08 * actionPulse;
    } else if (motion.actionMode === "explain") {
      const open = 0.62 + 0.38 * Math.max(0, Math.sin(actionAge * 4.6 + motion.actionSeed));
      leftUpperX -= 0.18 * actionPulse;
      rightUpperX -= 0.18 * actionPulse;
      leftUpperY += 0.15 * actionPulse;
      rightUpperY -= 0.15 * actionPulse;
      leftLowerX += 0.32 * actionPulse * open;
      rightLowerX += 0.32 * actionPulse * open;
      leftHandZ += 0.2 * actionPulse;
      rightHandZ -= 0.2 * actionPulse;
      actionHeadTurn += 0.025 * Math.sin(actionAge * 2.7 + motion.actionSeed) * actionPulse;
    } else if (motion.actionMode === "emphasize") {
      const leadRight = Math.sin(motion.actionSeed) > 0;
      const beat = Math.sin(actionAge * 6.2 + motion.actionSeed) * actionPulse;
      if (leadRight) {
        rightUpperX -= 0.1 * actionPulse;
        rightLowerX += 0.18 * actionPulse;
        rightHandZ -= 0.14 * actionPulse + 0.05 * beat;
      } else {
        leftUpperX -= 0.1 * actionPulse;
        leftLowerX += 0.18 * actionPulse;
        leftHandZ += 0.14 * actionPulse + 0.05 * beat;
      }
      actionNod += 0.045 * actionPulse;
    } else if (motion.actionMode === "acknowledge") {
      actionNod += 0.1 * actionPulse;
      actionHeadTilt += (Math.sin(motion.actionSeed) > 0 ? 1 : -1) * 0.025 * actionPulse;
      leftUpperX -= 0.025 * actionPulse;
      rightUpperX -= 0.025 * actionPulse;
    } else if (motion.actionMode === "idleShift") {
      const shift = Math.sin(actionAge * 3.4 + motion.actionSeed) * actionPulse;
      leftUpperY += 0.025 * shift;
      rightUpperY += 0.025 * shift;
      leftHandZ += 0.035 * shift;
      rightHandZ += 0.035 * shift;
      actionHeadTurn += 0.02 * shift;
    }

    leftUpperX -= listenLean;
    rightUpperX -= listenLean;
    leftLowerX += listening * 0.08;
    rightLowerX += listening * 0.08;

    setRigTarget("hips", 0.006 * breath - listenLean * 0.25, 0.018 * sway + 0.006 * postureNoise, 0.025 * weightShift);
    setRigTarget(
      "head",
      0.012 * breath + 0.018 * audioDrive + 0.022 * talkNod + 0.04 * cueNod + 0.075 * listenNod + actionNod + thinkingDrop - listenLean + headMicroX,
      0.026 * sway + 0.016 * talkNod + 0.04 * cueShake + actionHeadTurn + motion.gazeX * 0.2 + headMicroY,
      0.014 * Math.sin(elapsed * 0.62 + motion.stanceSeed) + curiousTilt + emotionTilt + actionHeadTilt - motion.gazeX * 0.06 + headMicroZ,
    );
    setRigTarget("neck", 0.01 * breath + 0.014 * talkNod + 0.018 * cueNod + headMicroX * 0.35, 0.016 * sway + 0.018 * cueShake + motion.gazeX * 0.08, -bodyLeanZ * 0.25);
    setRigTarget("upperChest", 0.022 * breath + 0.01 * chestNoise + 0.012 * audioDrive - listenLean * 0.75, 0.026 * sway + 0.014 * talk * beat, -0.018 * weightShift);
    setRigTarget("chest", 0.018 * breath + 0.008 * chestNoise + 0.008 * audioDrive - listenLean * 0.55, 0.018 * sway + 0.01 * talk * alternateBeat, -0.012 * weightShift);
    setRigTarget("spine", 0.012 * breath + 0.005 * postureNoise, 0.014 * sway, 0.01 * weightShift);
    setRigTarget("leftShoulder", 0.02 * breath - 0.012 * gesture + 0.008 * shoulderNoise, 0.018 * gesture, 0.028 * gesture + 0.012 * weightShift);
    setRigTarget("rightShoulder", 0.018 * breath - 0.01 * gesture - 0.008 * shoulderNoise, -0.018 * gesture, -0.028 * gesture + 0.01 * weightShift);
    setRigTarget("leftUpperArm", leftUpperX, leftUpperY, leftUpperZ + 0.018 * talkNod);
    setRigTarget("rightUpperArm", rightUpperX, rightUpperY, rightUpperZ - 0.018 * talkNod);
    setRigTarget("leftLowerArm", leftLowerX, leftLowerY, leftLowerZ + 0.012 * talkNod);
    setRigTarget("rightLowerArm", rightLowerX, rightLowerY, rightLowerZ - 0.012 * talkNod);
    setRigTarget("leftHand", leftHandX, leftHandY, leftHandZ);
    setRigTarget("rightHand", rightHandX, rightHandY, rightHandZ);
    setRigTarget("leftUpperLeg", 0.012 + 0.004 * weightShift, 0.012, 0.02 + 0.004 * slowSway);
    setRigTarget("rightUpperLeg", -0.006 - 0.004 * weightShift, -0.01, -0.018 + 0.004 * slowSway);
    setRigTarget("leftLowerLeg", -0.006, 0, -0.008 - 0.003 * weightShift);
    setRigTarget("rightLowerLeg", 0.008, 0, 0.006 + 0.003 * weightShift);
    setRigTarget("leftFoot", -0.012, 0.006, 0.01);
    setRigTarget("rightFoot", 0.01, -0.006, -0.008);

    Object.keys(bones).forEach((name) => applyRigTarget(name, delta));
  }

  function animate() {
    rafId = window.requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 1 / 30);
    const elapsed = clock.elapsedTime;

    motion.introAlpha = approach(motion.introAlpha, motion.introTarget, delta, 5.8);
    renderer.domElement.style.opacity = String(clamp(motion.introAlpha));

    updateCamera(delta, elapsed);
    if (currentVrm) {
      updateGaze(delta, elapsed);
      updateRig(delta, elapsed);
      updateImpactStretch(delta);
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
            applyNeutralPose();
            currentVrm.update(0);
            renderer.render(scene, camera);
            greetingTimer = window.setTimeout(() => {
              setStageReady(true);
              if (options.greetingAction !== false) {
                greet(options.greetingAction || "wave");
              }
            }, options.entryDelayMs ?? 160);
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
        motion.engagementTarget = 0.82;
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
        const lowerText = text.toLowerCase();
        if (profile.gestureMode === "bright") {
          triggerAction(/[!]|yay|amazing|wonderful|great|proud/.test(lowerText) ? "emphasize" : "sparkle", 0.48, 1.8, {
            force: true,
            minGap: 1.4,
          });
        } else if (profile.gestureMode === "soothe") {
          triggerAction("heart", 0.42, 2.2, { force: true, minGap: 1.6 });
        } else if (profile.gestureMode === "question") {
          triggerAction("acknowledge", 0.46, 1.55, { force: true, minGap: 1.4 });
        } else if (includesAny(lowerText, CUTE_WORDS)) {
          triggerAction("wave", 0.52, 1.75, { force: true, minGap: 1.2 });
        } else {
          triggerAction("explain", 0.34, 1.85, { force: true, minGap: 1.35 });
        }
      }
      if (!motion.speaking) {
        motion.engagementTarget = motion.listening ? 0.76 : motion.thinking ? 0.58 : 0.42;
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
      const emphasis = isEmphasisCue(fragment);
      if (emphasis) {
        motion.cueStrength = clamp(motion.cueStrength + 0.2, 0, 0.82);
        motion.cueNod = Math.max(motion.cueNod, 0.3);
        triggerAction("emphasize", randomBetween(0.28, 0.44), randomBetween(0.85, 1.25), { minGap: 1.8 });
      } else if (cue.mode === "bright" && Math.random() > 0.8) {
        triggerAction("sparkle", 0.3, 1.4, { minGap: 2.2 });
      } else if (cue.mode === "soothe" && Math.random() > 0.78) {
        triggerAction("heart", 0.26, 1.7, { minGap: 2.8 });
      } else if (cue.mode === "explain" && Math.random() > 0.82) {
        triggerAction("explain", 0.25, 1.5, { minGap: 2.4 });
      }
      if (cue.emotion) {
        motion.emotion = cue.emotion;
      }
    },
    setListening(isListening) {
      const nextListening = Boolean(isListening);
      if (motion.listening === nextListening) {
        return;
      }

      motion.listening = nextListening;
      if (nextListening) {
        motion.engagementTarget = 0.88;
        motion.nextListenNodAt = clock.elapsedTime + randomBetween(1.1, 2.8);
        motion.attentionLostUntil = 0;
        motion.nextGazeShift = clock.elapsedTime + randomBetween(0.08, 0.28);
      } else if (!motion.speaking) {
        motion.engagementTarget = motion.thinking ? 0.58 : 0.44;
        // A short acknowledgement makes the hand-off from user speech to thinking feel responsive.
        triggerAction("acknowledge", randomBetween(0.32, 0.48), randomBetween(0.85, 1.2), { minGap: 0.6 });
        motion.nextGazeShift = clock.elapsedTime + randomBetween(0.18, 0.42);
      }
    },
    setThinking(isThinking) {
      const nextThinking = Boolean(isThinking);
      const changed = motion.thinking !== nextThinking;
      motion.thinking = nextThinking;
      if (!motion.speaking && !motion.listening) {
        motion.engagementTarget = nextThinking ? 0.58 : 0.42;
      }
      if (changed && nextThinking && !motion.speaking) {
        // Deliberately glance aside while formulating a response, then the gaze spring returns to the user.
        motion.gazeTargetX = randomBetween(-0.16, 0.16);
        motion.gazeTargetY = randomBetween(-0.16, -0.09);
        motion.gazeHoldUntil = clock.elapsedTime + randomBetween(0.45, 0.9);
        motion.nextGazeShift = motion.gazeHoldUntil + randomBetween(0.18, 0.38);
      } else if (changed && !nextThinking) {
        motion.attentionX = 0;
        motion.attentionY = 0;
        motion.gazeTargetX = 0;
        motion.gazeTargetY = 0;
        motion.nextGazeShift = clock.elapsedTime + randomBetween(0.15, 0.32);
      }
      if (!motion.speaking) {
        motion.emotion = motion.thinking ? "thoughtful" : "relaxed";
      }
    },
    setBrainBehavior(brain = {}) {
      const behavior = brain.behavior || {};
      const emotion = brain.emotion || {};
      const thought = brain.internalThought || {};
      const attentionState = String(behavior.attentionState || brain.attentionState || "").toLowerCase();
      const requestedEmotion = String(emotion.label || emotion.primary || "").toLowerCase();
      const valence = clamp(Number(emotion.valence ?? 0.58));
      const arousal = clamp(Number(emotion.arousal ?? 0.42));
      const curiosity = clamp(Number(emotion.curiosity ?? 0.5));
      const empathy = clamp(Number(emotion.empathy ?? 0.72));
      const confidence = clamp(Number(emotion.confidence ?? thought.responseConfidence ?? 0.68));

      motion.speechEnergy = clamp(0.42 + arousal * 0.48 + confidence * 0.12, 0.42, 1);
      motion.engagementTarget = clamp(0.28 + empathy * 0.34 + curiosity * 0.22 + arousal * 0.16, 0.3, 0.92);
      motion.gestureIntensity = clamp(Number(behavior.gestureIntensity ?? 0.22 + arousal * 0.42), 0.12, 0.96);
      motion.gestureTempo = 2.6 + clamp(Number(behavior.gestureTempo ?? arousal)) * 2.4;
      motion.cueStrength = clamp(Number(behavior.microUncertainty ?? 1 - confidence), 0.05, 0.85);
      motion.cueNod = confidence > 0.62 ? 0.22 : 0.08;
      motion.gazeTargetX += clamp(Number(behavior.headTilt ?? 0), -1, 1) * 0.035;
      motion.nextGazeShift = clock.elapsedTime + randomBetween(0.18, 0.65);

      if (["happy", "excited", "curious", "comforting", "sad", "embarrassed", "surprised", "thoughtful", "confident", "sleepy"].includes(requestedEmotion)) {
        motion.emotion = requestedEmotion;
        motion.gestureMode = requestedEmotion === "comforting" || requestedEmotion === "sad" ? "soothe" : requestedEmotion === "curious" || requestedEmotion === "surprised" ? "question" : requestedEmotion === "confident" ? "firm" : requestedEmotion === "excited" || requestedEmotion === "happy" ? "bright" : "calm";
      } else if (attentionState === "reflecting" || empathy > 0.82) {
        motion.emotion = "sad";
        motion.gestureMode = "soothe";
      } else if (attentionState === "curious" || curiosity > 0.72) {
        motion.emotion = "curious";
        motion.gestureMode = "question";
      } else if (attentionState === "excited" || valence > 0.72 || arousal > 0.72) {
        motion.emotion = "happy";
        motion.gestureMode = "bright";
      } else if (confidence > 0.78) {
        motion.emotion = "focused";
        motion.gestureMode = "firm";
      } else {
        motion.emotion = "thoughtful";
        motion.gestureMode = "explain";
      }
    },
    setMouth,
    applyImpactStretch(boneName, stretchAmount = 1.2, returnSpeed = 12) {
      const normalizedName = String(boneName || "").replace(/[-_\s]/g, "").toLowerCase();
      const entry = Object.entries(BONE_NAMES).find(([label, humanoidName]) =>
        label.toLowerCase() === normalizedName || String(humanoidName).replace(/[-_\s]/g, "").toLowerCase() === normalizedName,
      );
      const bone = entry ? bones[entry[0]] : null;
      if (!bone) return false;
      const amount = clamp(Number(stretchAmount) || 1, 0.8, 1.45);
      const baseY = impact.stretches.get(bone)?.baseY ?? bone.scale.y;
      impact.stretches.set(bone, { baseY, returnSpeed: clamp(Number(returnSpeed) || 12, 2, 30) });
      bone.scale.y = baseY * amount;
      return true;
    },
    triggerImpactShake(intensity = 0.35, duration = 0.22) {
      impact.intensity = clamp(Number(intensity) || 0, 0, 1);
      impact.duration = clamp(Number(duration) || 0.22, 0.08, 1.2);
      impact.startedAt = clock.elapsedTime;
      return impact.intensity > 0;
    },
    setAudioLevel(level = 0) {
      motion.audioLevelTarget = clamp(Number(level) || 0, 0, 1);
    },
    getDiagnostics() {
      return lastDiagnostics;
    },
    greet,
    destroy() {
      window.clearTimeout(greetingTimer);
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      clearCurrentModel();
      pmremGenerator.dispose();
      scene.environment?.dispose?.();
      renderer.dispose();
      renderer.domElement.remove();
      if (activeImpactStage === stageApi) activeImpactStage = null;
    },
  };
}
