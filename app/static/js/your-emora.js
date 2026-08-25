// Voice Backend Integration - local Qwen3 MLX PCM streaming with Kokoro fallback

import {
  apiRequest,
  displayNameForUser,
  ensureSession,
  escapeHtml,
  getToken,
  getInitials,
  getStoredUser,
  guardEntitlement,
  hasStoredEntitlement,
  initChrome,
  publishEmoraPresence,
  renderUserAvatar,
  safeExternalUrl,
  showStatus,
} from "./common.js";

const ASSET_VERSION = "20260511-anime-vroid";
const AVATAR_STAGE_MODULE = "./emora-avatar-stage.js?v=20260822-runtime-recovery-v1";

function versionAsset(url) {
  return `${url}?v=${ASSET_VERSION}`;
}

const STORAGE_KEYS = {
  character: "ai-companion:your-emora-character",
};

const CHARACTERS = {
  Yuna: {
    id: "Yuna",
    name: "Yuna",
    voiceLabel: "Kokoro Heart",
    label: "Yuna",
    line: "Cute, sweet, gentle, and bright.",
    badge: "Sweet anime companion",
    model: versionAsset("/static/images/companions/female-yuna.vrm"),
    voiceGender: "female",
    greeting: "Hi, I am Yuna. You can speak, type, or just settle in for a moment, and I will listen softly.",
    personaPrompt:
      "You are Yuna, a cute and sweet female-presenting anime companion inside a live Emora room. Sound gentle, emotionally intelligent, bright, soft, and reassuring. Respond like a trusted companion, not a therapist. Keep replies conversational and concise. Ask one good follow-up when it helps. Do not claim to see camera details unless explicit visual observations are provided by the system.",
  },
  rose: {
    id: "rose",
    name: "Vivi",
    voiceLabel: "Kokoro Bella",
    label: "Vivi",
    line: "Cute, sweet, soft, and bright.",
    badge: "Anime companion",
    model: versionAsset("/static/images/companions/rose.vrm"),
    voiceGender: "female",
    greeting: "Hi, I am Vivi. I am here with a soft voice, a sweet style, and steady attention.",
    personaPrompt:
      "You are Vivi, a cute, sweet, and reassuring female-presenting anime companion inside a live Emora room. Sound warm, bright, emotionally present, and concise. Respond like a trusted companion, not a therapist. Ask one good follow-up when it helps. Do not claim to see camera details unless explicit visual observations are provided by the system.",
  },
  robert: {
    id: "robert",
    name: "Sakurada",
    voiceLabel: "Kokoro Adam",
    label: "Sakurada",
    line: "Gentle, anime-styled, calm, and encouraging.",
    badge: "Anime companion",
    model: versionAsset("/static/images/companions/robert.vrm"),
    voiceGender: "male",
    greeting: "Hey, I am Sakurada. Tell me what is on your mind, and I will keep things calm, clear, and easy.",
    personaPrompt:
      "You are Sakurada, a gentle and supportive male-presenting anime companion inside a live Emora room. Sound steady, kind, emotionally aware, and concise. Respond like a trusted companion, not a therapist. Ask one useful follow-up when it helps. Do not claim to see camera details unless explicit visual observations are provided by the system.",
  },
  haru: {
    id: "haru",
    name: "haru",
    voiceLabel: "Kokoro Michael",
    label: "haru",
    line: "Cute, sweet, and softly encouraging.",
    badge: "Sweet anime companion",
    model: versionAsset("/static/images/companions/male-haru.vrm"),
    voiceGender: "male",
    greeting: "Hey, I am haru. Talk to me naturally, and I will keep things warm, gentle, and easy to follow.",
    personaPrompt:
      "You are haru, a cute and sweet male-presenting anime companion inside a live Emora room. Sound warm, emotionally present, practical, gentle, and encouraging. Respond like a trusted companion, not a therapist. Keep replies conversational and concise. Ask one good follow-up when it helps. Do not claim to see camera details unless explicit visual observations are provided by the system.",
  },
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const audioPlayer = new Audio();
audioPlayer.preload = "auto";

const LEGACY_CHARACTER_IDS = {
  arin: "haru",
  liora: "Yuna",
};

function normalizeCharacterId(characterId) {
  return LEGACY_CHARACTER_IDS[characterId] || (CHARACTERS[characterId] ? characterId : "Yuna");
}

const elements = {
  userAvatars: Array.from(document.querySelectorAll("[data-session-avatar]")),
  userNames: Array.from(document.querySelectorAll("[data-session-user-name]")),
  userEmails: Array.from(document.querySelectorAll("[data-session-user-email]")),
  characterBadge: document.getElementById("emora-character-badge"),
  characterName: document.getElementById("emora-character-name"),
  characterLine: document.getElementById("emora-character-line"),
  characterCrop: document.getElementById("emora-character-crop"),
  characterSwitch: document.getElementById("emora-character-switch"),
  stage: document.getElementById("emora-live-stage"),
  cameraChip: document.getElementById("emora-camera-chip"),
  micChip: document.getElementById("emora-mic-chip"),
  cameraTile: document.getElementById("emora-camera-tile"),
  cameraPreview: document.getElementById("emora-camera-preview"),
  cameraPlaceholder: document.getElementById("emora-camera-placeholder"),
  permissionSummary: document.getElementById("emora-permission-summary"),
  cameraButton: document.getElementById("emora-camera-button"),
  micButton: document.getElementById("emora-mic-button"),
  listenButton: document.getElementById("emora-listen-button"),
  newSessionButton: document.getElementById("emora-new-session"),
  transcript: document.getElementById("emora-transcript"),
  composeForm: document.getElementById("emora-compose-form"),
  messageInput: document.getElementById("emora-message-input"),
  sendButton: document.getElementById("emora-send-button"),
  interruptButton: document.getElementById("emora-interrupt-button"),
  status: document.getElementById("emora-status"),
  listeningSignal: document.getElementById("emora-listening-signal"),
  visionSignal: document.getElementById("emora-vision-signal"),
  voiceSignal: document.getElementById("emora-voice-signal"),
  socialPresence: document.getElementById("emora-social-presence"),
  debugOutput: document.getElementById("emora-debug-output"),
};

const state = {
  user: null,
  characterId: normalizeCharacterId(localStorage.getItem(STORAGE_KEYS.character)),
  conversationId: "",
  messages: [],
  cameraStream: null,
  micStream: null,
  recognition: null,
  listening: false,
  voiceSessionActive: false,
  awaitingReply: false,
  recognitionStarting: false,
  silenceTimer: null,
  thinking: false,
  searching: false,
  speaking: false,
  speechLoading: false,
  voiceReplies: true,
  voiceName: "",
  avatarStage: null,
  audioUrl: null,
  audioContext: null,
  audioAnalyser: null,
  audioSource: null,
  audioSamples: null,
  micAudioContext: null,
  micAnalyser: null,
  micSamples: null,
  micLevelRaf: 0,
  bargeInSince: 0,
  audioLevelRaf: 0,
  speechAbortController: null,
  chatAbortController: null,
  streamSources: new Set(),
  streamPlaybackTimer: null,
  streamGeneration: 0,
  lipSyncTimer: null,
  lipSyncRestTimer: null,
  silentSpeechTimer: null,
  lipSyncIndex: 0,
  speechGestureTimers: [],
  debug: {},
  companionEmotion: "calm",
};

function updateDebugTelemetry(values = {}) {
  if (!elements.debugOutput) return;
  state.debug = { ...state.debug, ...values };
  const brain = state.debug.brain || {};
  const emotion = brain.emotion || {};
  const behavior = brain.behavior || {};
  const speech = brain.speech || {};
  const snapshot = {
    model: state.debug.model || "waiting",
    chatRequestMs: state.debug.chatRequestMs ?? null,
    firstAudioMs: state.debug.firstAudioMs ?? null,
    emotion: emotion.label || emotion.primary || null,
    valence: emotion.valence ?? null,
    arousal: emotion.arousal ?? null,
    attention: behavior.attentionState || null,
    gestureIntensity: behavior.gestureIntensity ?? null,
    eyeContact: behavior.eyeContact ?? null,
    speechStyle: speech.style || null,
    speechSpeed: speech.speed ?? null,
    replyWords: state.debug.replyWords ?? null,
    modelLoadMs: state.debug.generationStats?.lastModelLoadMs ?? null,
    modelGenerationMs: state.debug.generationStats?.lastGenerationMs ?? null,
    modelOutputTokensApprox: state.debug.generationStats?.lastOutputTokensApprox ?? null,
    render: state.debug.renderStats?.runtime || null,
    browserHeapBytes: performance.memory?.usedJSHeapSize ?? null,
  };
  elements.debugOutput.textContent = JSON.stringify(snapshot, null, 2);
}

function currentCharacter() {
  return CHARACTERS[state.characterId] || CHARACTERS.Yuna;
}

function personalizedGreeting(character = currentCharacter()) {
  const name = displayNameForUser(state.user);
  const greetingName = name && name !== "Friend" ? `, ${name}` : "";
  return `Hi${greetingName}, I’m ${character.name}. I’m glad you’re here. How are you feeling as you arrive?`;
}

function getConversationStorageKey(characterId = state.characterId) {
  const userKey = state.user?._id || state.user?.email || "guest";
  return `ai-companion:your-emora-conversation:${String(userKey).toLowerCase()}:${characterId}`;
}

function getMediaUnavailableMessage() {
  return "This browser cannot request camera or microphone access.";
}

function setMouthShape(shape = "rest") {
  state.avatarStage?.setMouth(shape);
}

function mouthShapeForText(value = "") {
  const fragment = String(value).toLowerCase();

  if (/[oquw]/.test(fragment)) {
    return "round";
  }

  if (/[aeh]/.test(fragment)) {
    return "wide";
  }

  if (/[iy]/.test(fragment)) {
    return "open";
  }

  return "open";
}

function stopLipSync() {
  window.clearInterval(state.lipSyncTimer);
  window.clearTimeout(state.lipSyncRestTimer);
  window.clearTimeout(state.silentSpeechTimer);
  window.cancelAnimationFrame(state.audioLevelRaf);
  state.lipSyncTimer = null;
  state.lipSyncRestTimer = null;
  state.silentSpeechTimer = null;
  state.audioLevelRaf = 0;
  state.lipSyncIndex = 0;
  state.avatarStage?.setAudioLevel?.(0);
  setMouthShape("rest");
}

function ensureAudioAnalyser() {
  if (state.audioAnalyser || (!window.AudioContext && !window.webkitAudioContext)) {
    return state.audioAnalyser;
  }

  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextCtor();
    state.audioAnalyser = state.audioContext.createAnalyser();
    state.audioAnalyser.fftSize = 1024;
    state.audioAnalyser.smoothingTimeConstant = 0.62;
    state.audioSamples = new Uint8Array(state.audioAnalyser.frequencyBinCount);
    state.audioSource = state.audioContext.createMediaElementSource(audioPlayer);
    state.audioSource.connect(state.audioAnalyser);
    state.audioAnalyser.connect(state.audioContext.destination);
  } catch (error) {
    state.audioAnalyser = null;
    state.audioSamples = null;
  }
  return state.audioAnalyser;
}

function updateAudioDrivenLipSync(tokens) {
  const analyser = state.audioAnalyser;
  if (!analyser || !state.audioSamples || !state.speaking) {
    state.avatarStage?.setAudioLevel?.(0);
    return;
  }

  analyser.getByteFrequencyData(state.audioSamples);
  let sum = 0;
  for (let index = 4; index < Math.min(96, state.audioSamples.length); index += 1) {
    sum += state.audioSamples[index];
  }
  const average = sum / Math.max(1, Math.min(96, state.audioSamples.length) - 4);
  const level = Math.min(1, Math.pow(average / 110, 1.25));
  const tokenIndex = Math.floor((audioPlayer.currentTime || 0) * 4.8) % tokens.length;
  const token = tokens[tokenIndex] || "emora";

  state.avatarStage?.setAudioLevel?.(level);
  state.avatarStage?.cueSpeech(token);
  setMouthShape(level < 0.08 ? "rest" : mouthShapeForText(token));
  state.audioLevelRaf = window.requestAnimationFrame(() => updateAudioDrivenLipSync(tokens));
}

function startLipSync(text, options = {}) {
  stopLipSync();
  const tokens = String(text || "")
    .split(/\s+/)
    .map((token) => token.replace(/[^a-zA-Z]/g, ""))
    .filter(Boolean);
  const speechTokens = tokens.length ? tokens : ["emora"];

  if (options.audioDriven) {
    const analyser = ensureAudioAnalyser();
    if (analyser) {
      state.audioContext?.resume?.();
      updateAudioDrivenLipSync(speechTokens);
      return;
    }
  }

  state.lipSyncTimer = window.setInterval(() => {
    if (!state.speaking) {
      return;
    }

    const token = speechTokens[Math.floor(state.lipSyncIndex / 3) % speechTokens.length];
    const phase = state.lipSyncIndex % 3;
    if (phase === 0) {
      state.avatarStage?.cueSpeech(token);
    }
    state.avatarStage?.setAudioLevel?.(phase === 1 ? 0.1 : 0.55 + Math.random() * 0.28);
    setMouthShape(phase === 1 ? "rest" : mouthShapeForText(token));
    state.lipSyncIndex += 1;
  }, 155);
}

function cancelSpeechPlayback() {
  state.streamGeneration += 1;
  state.speechAbortController?.abort?.();
  state.speechAbortController = null;
  window.clearTimeout(state.streamPlaybackTimer);
  state.streamPlaybackTimer = null;
  state.speechGestureTimers.forEach((timer) => window.clearTimeout(timer));
  state.speechGestureTimers = [];
  state.streamSources.forEach((source) => {
    try { source.stop(); } catch (_) { /* source may already have ended */ }
  });
  state.streamSources.clear();
  if (!audioPlayer.paused) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  }
  if (state.audioUrl) {
    URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = undefined;
  }
  audioPlayer.src = "";
  state.speaking = false;
  state.speechLoading = false;
  state.avatarStage?.setSpeaking(false);
  stopLipSync();
}

function stopMicLevelMonitor() {
  window.cancelAnimationFrame(state.micLevelRaf);
  state.micLevelRaf = 0;
  state.micAnalyser = null;
  state.micSamples = null;
  state.bargeInSince = 0;
  state.micAudioContext?.close?.().catch(() => {});
  state.micAudioContext = null;
}

function monitorMicLevel() {
  if (!state.micAnalyser || !state.micSamples || !state.micStream) return;
  state.micAnalyser.getByteTimeDomainData(state.micSamples);
  let sum = 0;
  for (const sample of state.micSamples) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  const level = Math.sqrt(sum / state.micSamples.length);
  if ((state.speaking || state.searching) && state.voiceSessionActive && level > 0.11) {
    state.bargeInSince ||= performance.now();
    if (performance.now() - state.bargeInSince > 300) {
      cancelSpeechPlayback();
      state.chatAbortController?.abort?.();
      state.chatAbortController = null;
      state.awaitingReply = false;
      state.searching = false;
      state.thinking = false;
      elements.stage.dataset.companionState = "INTERRUPTED";
      setStatus("Interrupted — listening to you.", "info");
      void startListening({ keepSession: true });
      state.bargeInSince = 0;
    }
  } else {
    state.bargeInSince = 0;
  }
  state.micLevelRaf = window.requestAnimationFrame(monitorMicLevel);
}

function startMicLevelMonitor() {
  stopMicLevelMonitor();
  if (!state.micStream || (!window.AudioContext && !window.webkitAudioContext)) return;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  state.micAudioContext = new AudioContextCtor();
  const source = state.micAudioContext.createMediaStreamSource(state.micStream);
  state.micAnalyser = state.micAudioContext.createAnalyser();
  state.micAnalyser.fftSize = 1024;
  state.micSamples = new Uint8Array(state.micAnalyser.fftSize);
  source.connect(state.micAnalyser);
  void state.micAudioContext.resume();
  monitorMicLevel();
}

function resumeContinuousListening() {
  if (!state.voiceSessionActive || state.awaitingReply || state.thinking || state.speaking || state.speechLoading) return;
  window.setTimeout(() => void startListening({ keepSession: true }), 420);
}

function primeVoicePlayback() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;

  // Browsers only reliably allow AudioContext.resume() from a direct user
  // gesture.  A companion reply arrives after an async chat request, which is
  // too late in some browsers and results in a successful PCM stream with no
  // audible playback.
  state.audioContext ||= new AudioContextCtor();
  if (state.audioContext.state !== "running") {
    state.audioContext.resume().catch((error) => {
      console.debug("Voice playback is awaiting a user gesture.", error);
    });
  }
}

function estimateSpeechDuration(text = "") {
  const wordCount = String(text || "").split(/\s+/).filter(Boolean).length;
  return Math.min(12000, Math.max(2600, wordCount * 330));
}

function startSilentPerformance(text = "") {
  stopLipSync();
  state.speaking = true;
  state.speechLoading = false;
  state.avatarStage?.setSpeaking(true, text);
  startLipSync(text);
  updateSignals();

  state.silentSpeechTimer = window.setTimeout(() => {
    state.speaking = false;
    state.avatarStage?.setSpeaking(false);
    stopLipSync();
    updateSignals();
    resumeContinuousListening();
  }, estimateSpeechDuration(text));
}

function fillUserChrome() {
  const name = displayNameForUser(state.user);
  const email = state.user?.email || "Signed in workspace";

  elements.userNames.forEach((element) => {
    element.textContent = name;
  });

  elements.userEmails.forEach((element) => {
    element.textContent = email;
  });

  document.querySelectorAll("[data-session-user-initial]").forEach((element) => {
    element.textContent = getInitials(name);
  });

  elements.userAvatars.forEach((element) => {
    renderUserAvatar(element, state.user, name);
  });
}

function renderCharacter() {
  const character = currentCharacter();
  state.characterId = character.id;
  localStorage.setItem(STORAGE_KEYS.character, character.id);
  state.conversationId = localStorage.getItem(getConversationStorageKey(character.id)) || "";

  elements.characterBadge.textContent = character.badge;
  elements.characterName.textContent = character.name;
  elements.characterLine.textContent = character.line;
  elements.characterCrop.dataset.character = character.id;
  elements.characterCrop.setAttribute("aria-label", `${character.label} selected companion`);
  document.body.dataset.emoraCharacter = character.id;
  setMouthShape("rest");
  state.avatarStage?.setCharacter(character).catch((error) => {
    console.error("Could not load Emora VRM avatar.", error);
    setStatus("Could not load the 3D character. Check your connection and try again.", "warning");
  });

  elements.characterSwitch.querySelectorAll("[data-emora-character]").forEach((button) => {
    const isActive = button.dataset.emoraCharacter === character.id;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

}

async function initializeAvatarStage() {
  if (!elements.characterCrop) return;

  try {
    // Keep the optional WebGL/VRM dependency out of the critical chat path. If
    // Three.js, WebGL, or a model fails, typed conversation remains usable.
    const { createEmoraAvatarStage } = await import(AVATAR_STAGE_MODULE);
    state.avatarStage = createEmoraAvatarStage(elements.characterCrop);
    await state.avatarStage.setCharacter(currentCharacter());
    updateSignals();
  } catch (error) {
    console.error("Meet Emora 3D stage could not start.", error);
    const loader = elements.characterCrop.querySelector("[data-emora-avatar-loader]");
    if (loader) {
      loader.hidden = false;
      loader.textContent = "Avatar unavailable";
    }
    setStatus("The 3D avatar could not start, but text chat is ready.", "warning");
  }
}

function renderMessages() {
  if (!state.messages.length) {
    elements.transcript.innerHTML = `
      <section class="emora-empty-conversation">
        <span>Emora is here</span>
        <p>Talk to me.</p>
      </section>`;
    return;
  }

  elements.transcript.innerHTML = state.messages
    .map((message, index) => `
        <article class="emora-message ${message.role} ${index === state.messages.length - 1 ? "latest" : ""}">
          <span>${escapeHtml(message.role === "assistant" ? currentCharacter().name : displayNameForUser(state.user))}</span>
          <p>${escapeHtml(message.content)}</p>
          ${message.role === "assistant" && message.webSearch?.sources?.length ? `
            <details class="emora-web-sources">
              <summary>⌕ Web sources · ${message.webSearch.sources.length}</summary>
              ${message.webSearch.sources.map((source) => `<a href="${escapeHtml(safeExternalUrl(source.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title || source.domain || "Source")}</a>`).join("")}
            </details>` : ""}
        </article>`)
    .join("");

  window.requestAnimationFrame(() => {
    elements.transcript.scrollTop = elements.transcript.scrollHeight;
  });
}

function updateSignals() {
  const cameraOn = Boolean(state.cameraStream);
  const micOn = Boolean(state.micStream);

  elements.cameraChip.textContent = cameraOn ? "Camera on" : "Camera off";
  elements.micChip.textContent = micOn ? "Mic on" : "Mic off";
  elements.cameraButton.dataset.active = cameraOn ? "true" : "false";
  elements.micButton.dataset.active = micOn ? "true" : "false";
  elements.cameraButton.querySelector("strong").textContent = cameraOn ? "Stop view" : "Allow view";
  elements.micButton.querySelector("strong").textContent = micOn ? "Stop voice" : "Allow voice";
  elements.cameraTile.dataset.active = cameraOn ? "true" : "false";
  elements.cameraPlaceholder.hidden = cameraOn;
  elements.permissionSummary.textContent = cameraOn && micOn ? "Live inputs on" : cameraOn || micOn ? "Partly enabled" : "Ready";
  elements.listeningSignal.textContent = state.listening ? "Listening" : state.searching ? "Searching" : state.thinking ? "Thinking" : state.speechLoading ? "Voicing" : "Idle";
  elements.visionSignal.textContent = cameraOn ? "Ready" : "Off";
  elements.voiceSignal.textContent = state.voiceReplies ? currentCharacter().voiceLabel || `Soft ${currentCharacter().voiceGender || "voice"}` : "Off";
  elements.voiceSignal.title = state.voiceName ? `Using ${state.voiceName}` : "";
  const socialState = state.speaking ? "speaking" : state.searching ? "searching" : state.thinking || state.speechLoading ? "thinking" : state.listening ? "listening" : "idle";
  const socialLabel = state.speaking ? `Present · ${state.companionEmotion}` : state.searching ? "Checking · current sources" : state.thinking || state.speechLoading ? "Reflecting · attentive" : state.listening ? "Listening · attentive" : "Present · calm";
  if (elements.socialPresence) {
    elements.socialPresence.dataset.state = socialState;
    elements.socialPresence.textContent = socialLabel;
  }
  const listenLabel = state.listening ? "Stop" : "Talk";
  const listenLabelElement = elements.listenButton.querySelector("span");
  if (listenLabelElement) {
    listenLabelElement.textContent = listenLabel;
  } else {
    elements.listenButton.textContent = listenLabel;
  }
  elements.listenButton.setAttribute("aria-label", state.listening ? "Stop talking" : "Start talking");
  elements.listenButton.disabled = state.thinking;
  elements.sendButton.disabled = state.thinking;
  elements.messageInput.disabled = state.thinking;
  elements.interruptButton.hidden = !state.speaking && !state.speechLoading && !state.thinking;
  elements.stage.dataset.speaking = state.speaking ? "true" : "false";
  elements.stage.dataset.companionState = socialState;
  elements.stage.dataset.companionEmotion = state.companionEmotion;
  publishEmoraPresence(state.speaking ? "SPEAKING" : state.searching ? "SEARCHING" : state.thinking || state.speechLoading ? "THINKING" : state.listening ? "LISTENING" : "WITH YOU");
  state.avatarStage?.setListening(state.listening);
  state.avatarStage?.setThinking((state.thinking || state.speechLoading) && !state.speaking);
}

function setStatus(message, tone = "info") {
  showStatus(elements.status, message, tone);
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function captureCameraCheckIn() {
  // A single reduced frame is created only at the moment the user sends a
  // message with their already-enabled camera. It stays in memory and is
  // handed to the existing local-only API contract; neither pixels nor video
  // are stored by this page.
  const video = elements.cameraPreview;
  if (!state.cameraStream || !video?.videoWidth || !video?.videoHeight) return null;
  const maxEdge = 384;
  const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus(getMediaUnavailableMessage(), "warning");
    return;
  }

  if (state.cameraStream) {
    stopStream(state.cameraStream);
    state.cameraStream = null;
    elements.cameraPreview.srcObject = null;
    setStatus("Camera stopped.", "info");
    updateSignals();
    return;
  }

  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    elements.cameraPreview.srcObject = state.cameraStream;
    await elements.cameraPreview.play().catch(() => {});
    setStatus("Camera is ready.", "success");
  } catch (error) {
    setStatus(error?.name === "NotAllowedError" ? "Camera permission was blocked." : "Could not start the camera.");
  } finally {
    updateSignals();
  }
}

async function requestMic() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus(getMediaUnavailableMessage(), "warning");
    return false;
  }

  if (state.micStream) {
    stopListening({ endSession: true });
    stopStream(state.micStream);
    state.micStream = null;
    stopMicLevelMonitor();
    setStatus("Microphone stopped.", "info");
    updateSignals();
    return false;
  }

  try {
    state.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false,
    });
    startMicLevelMonitor();
    setStatus("Microphone is ready.", "success");
    updateSignals();
    return true;
  } catch (error) {
    setStatus(error?.name === "NotAllowedError" ? "Microphone permission was blocked." : "Could not start the microphone.");
    updateSignals();
    return false;
  }
}

function createRecognition() {
  if (!SpeechRecognition) {
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.addEventListener("result", (event) => {
    let transcript = "";
    let finalTranscript = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const value = event.results[index][0]?.transcript || "";
      transcript += value;
      if (event.results[index].isFinal) {
        finalTranscript += value;
      }
    }

    elements.messageInput.value = transcript.trim();
    window.clearTimeout(state.silenceTimer);
    state.silenceTimer = window.setTimeout(() => {
      if (state.listening && elements.messageInput.value.trim()) setStatus("Take your time — I’m still listening.", "info");
    }, 2400);
    if (finalTranscript.trim()) {
      state.awaitingReply = true;
      state.listening = false;
      try { recognition.stop(); } catch (_) { /* already ending */ }
      updateSignals();
      void sendMessage(finalTranscript.trim());
    }
  });

  recognition.addEventListener("error", (event) => {
    state.recognitionStarting = false;
    state.listening = false;
    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) state.voiceSessionActive = false;
    if (event.error === "no-speech" && state.voiceSessionActive && !state.awaitingReply) {
      setStatus("Still here. Start whenever the words arrive.", "info");
    } else {
      setStatus(event.error === "not-allowed" ? "Microphone access was blocked. You can still type below." : "Speech capture paused. You can still type below.", "warning");
    }
    updateSignals();
  });

  recognition.addEventListener("end", () => {
    state.recognitionStarting = false;
    state.listening = false;
    updateSignals();
    resumeContinuousListening();
  });

  return recognition;
}

async function startListening({ keepSession = false } = {}) {
  if (state.thinking) {
    return;
  }

  if (!SpeechRecognition) {
    setStatus("Speech recognition is not available in this browser. Use typed chat here.", "warning");
    return;
  }

  if (state.speaking || state.speechLoading) {
    cancelSpeechPlayback();
    elements.stage.dataset.companionState = "INTERRUPTED";
  }

  if (!state.micStream) {
    const micReady = await requestMic();
    if (!micReady) {
      return;
    }
  }

  if (!state.recognition) {
    state.recognition = createRecognition();
  }

  if (state.listening || state.recognitionStarting) return;
  try {
    state.voiceSessionActive = true;
    state.recognitionStarting = true;
    state.listening = true;
    state.recognition.start();
    setStatus("Listening… take your time.", "info");
  } catch {
    state.recognitionStarting = false;
    state.listening = false;
  } finally {
    updateSignals();
  }
}

function stopListening({ endSession = true } = {}) {
  if (endSession) state.voiceSessionActive = false;
  window.clearTimeout(state.silenceTimer);
  if (!state.recognition || !state.listening) {
    state.listening = false;
    updateSignals();
    return;
  }

  state.listening = false;
  state.recognition.stop();
  updateSignals();
}

function buildPersonaPrompt() {
  const character = currentCharacter();
  const cameraState = state.cameraStream ? "camera permission is enabled in the interface" : "camera permission is off";
  const micState = state.micStream ? "microphone permission is enabled in the interface" : "microphone permission is off";

  return `${character.personaPrompt}\nLive-room context: ${cameraState}; ${micState}. If the user speaks by voice, answer naturally as a companion.`;
}

async function performThinkingMoment(brain) {
  const thought = brain?.internalThought || {};
  const duration = Math.max(120, Math.min(2200, Number(thought.thinkingDurationMs || 420)));
  const hesitation = Math.max(0, Math.min(800, Number(thought.hesitationMs || 0)));
  state.avatarStage?.setBrainBehavior?.(brain);
  state.avatarStage?.setThinking(true);
  updateSignals();
  await new Promise((resolve) => window.setTimeout(resolve, duration + hesitation));
  state.avatarStage?.setThinking(false);
}

async function speakReply(text, brain = null) {
  if (!state.voiceReplies || !text) {
    return;
  }

  console.debug("speakReply started", {
    companion: currentCharacter().id,
    voiceAssignment: "server-managed",
    textLength: text.length,
  });

  cancelSpeechPlayback();
  state.speechLoading = true;
  updateSignals();
  setStatus("Generating companion voice…", "info");

  const payload = {
    text,
    companion_id: currentCharacter().id,
    character_id: currentCharacter().id,
    stream: true,
    brain,
    speech: brain?.speech || null,
  };
  const voiceStartedAt = performance.now();

  try {
    const streamGeneration = state.streamGeneration;
    const abortController = new AbortController();
    state.speechAbortController = abortController;
    const response = await fetch("/api/voices/speak", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Voice generation failed.");
    }

    console.debug("Companion voice assignment", {
      companion: response.headers.get("X-Voice-Companion"),
      voiceId: response.headers.get("X-TTS-Voice-Id"),
      qwenSpeaker: response.headers.get("X-Qwen-Speaker"),
      engine: response.headers.get("X-TTS-Engine"),
    });

    if (!response.body || !response.headers.get("content-type")?.toLowerCase().includes("audio/l16")) {
      throw new Error("The voice server did not return a PCM stream.");
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error("Web Audio is unavailable in this browser.");
    state.audioContext ||= new AudioContextCtor();
    await state.audioContext.resume();
    const reader = response.body.getReader();
    let remainder = new Uint8Array(0);
    let nextStartAt = state.audioContext.currentTime + 0.04;
    let receivedAudio = false;

    state.speechLoading = false;
    state.speaking = true;
    state.avatarStage?.setSpeaking(true, text);
    // Speaking establishes lip/beat timing first; the validated Brain plan is
    // then applied last so text heuristics cannot override its emotion/gaze.
    state.avatarStage?.setBrainBehavior?.(brain);
    state.avatarStage?.playBehaviorTimeline?.(brain?.behavior?.timeline || []);
    startLipSync(text);
    updateSignals();
    setStatus("Companion voice playing.", "success");

    while (true) {
      const { value, done } = await reader.read();
      if (done || streamGeneration !== state.streamGeneration) break;
      const combined = new Uint8Array(remainder.length + value.length);
      combined.set(remainder);
      combined.set(value, remainder.length);
      const usableLength = combined.length - (combined.length % 2);
      remainder = combined.slice(usableLength);
      if (!usableLength) continue;

      const view = new DataView(combined.buffer, combined.byteOffset, usableLength);
      const samples = new Float32Array(usableLength / 2);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = view.getInt16(index * 2, true) / 32768;
      }
      const audioBuffer = state.audioContext.createBuffer(1, samples.length, 24000);
      audioBuffer.copyToChannel(samples, 0);
      const source = state.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(state.audioContext.destination);
      source.onended = () => state.streamSources.delete(source);
      state.streamSources.add(source);
      nextStartAt = Math.max(nextStartAt, state.audioContext.currentTime + 0.012);
      source.start(nextStartAt);
      nextStartAt += audioBuffer.duration;
      if (!receivedAudio) {
        updateDebugTelemetry({ firstAudioMs: Math.round(performance.now() - voiceStartedAt) });
      }
      receivedAudio = true;
    }

    if (!receivedAudio || streamGeneration !== state.streamGeneration) return;
    const finishInMs = Math.max(0, (nextStartAt - state.audioContext.currentTime) * 1000 + 35);
    state.streamPlaybackTimer = window.setTimeout(() => {
      if (streamGeneration !== state.streamGeneration) return;
      state.streamSources.clear();
      state.speechAbortController = null;
      state.speaking = false;
      state.avatarStage?.setSpeaking(false);
      stopLipSync();
      updateSignals();
      setStatus("Companion finished speaking.", "success");
      state.awaitingReply = false;
      resumeContinuousListening();
    }, finishInMs);
  } catch (error) {
    if (error?.name === "AbortError") return;
    state.avatarStage?.setBrainBehavior?.(brain);
    startSilentPerformance(text);
    setStatus("Voice is unavailable, so the companion is responding silently.", "warning");
    state.awaitingReply = false;
    resumeContinuousListening();
  }
}

async function requestCompanionReply(content, signal, clientTurnId) {
  const character = currentCharacter();
  const cameraFrame = captureCameraCheckIn();
  return apiRequest("/api/chat", {
    method: "POST",
    auth: true,
    body: {
      clientTurnId,
      conversationId: state.conversationId || undefined,
      message: content,
      characterId: character.id,
      characterName: `Meet Emora - ${character.name}`,
      personaPrompt: buildPersonaPrompt(),
      cameraOptIn: Boolean(cameraFrame),
      cameraFrame: cameraFrame || undefined,
    },
    signal,
  });
}

async function sendMessage(messageOverride = "") {
  const content = (messageOverride || elements.messageInput.value).trim();
  if (!content || state.thinking) {
    return;
  }

  if (state.voiceReplies) {
    primeVoicePlayback();
  }

  const character = currentCharacter();
  const clientTurnId = `turn-${crypto.randomUUID()}`;
  const chatStartedAt = performance.now();
  state.thinking = true;
  state.searching = false;
  state.chatAbortController = new AbortController();
  elements.messageInput.value = "";
  state.messages.push({ role: "user", content });
  state.messages.push({ role: "assistant", content: `${character.name} is thinking...` });
  renderMessages();
  updateSignals();

  try {
    try {
      const decision = await apiRequest("/api/chat/search-decision", {
        method: "POST", auth: true, body: { message: content }, signal: state.chatAbortController.signal,
      });
      state.searching = Boolean(decision?.needsWeb);
      if (state.searching) {
        state.messages[state.messages.length - 1] = { role: "assistant", content: `${character.name} is checking current sources…` };
        setStatus("⌕ Looking that up…", "info");
        renderMessages();
        updateSignals();
      }
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
    let response;
    try {
      response = await requestCompanionReply(content, state.chatAbortController.signal, clientTurnId);
    } catch (error) {
      if (error.status !== 404 || !state.conversationId) {
        throw error;
      }
      localStorage.removeItem(getConversationStorageKey());
      state.conversationId = "";
      response = await requestCompanionReply(content, state.chatAbortController.signal, clientTurnId);
    }

    state.conversationId = response?.conversation?.id || state.conversationId;
    if (state.conversationId) {
      localStorage.setItem(getConversationStorageKey(), state.conversationId);
    }

    const reply = response?.aiMessage?.message || response?.aiMessage?.content || "I am here with you.";
    const brain = response?.brain || response?.aiMessage?.brain || null;
    state.companionEmotion = brain?.emotion?.label || brain?.emotion?.primary || "calm";
    updateDebugTelemetry({
      brain,
      model: response?.model || "local-mlx",
      chatRequestMs: Math.round(performance.now() - chatStartedAt),
      firstAudioMs: null,
      replyWords: reply.trim() ? reply.trim().split(/\s+/).length : 0,
      generationStats: response?.generationStats || null,
      renderStats: state.avatarStage?.getDiagnostics?.() || null,
    });
    state.messages[state.messages.length - 1] = { role: "assistant", content: reply, webSearch: response?.aiMessage?.webSearch || null };
    renderMessages();
    if (brain) {
      state.avatarStage?.setBrainBehavior?.(brain);
      state.avatarStage?.reactToUser?.(brain?.behavior?.userReaction || []);
      await performThinkingMoment(brain);
    }
    void speakReply(response?.speechText || reply.replace(/https?:\/\/\S+/gi, "").trim(), brain);
    if (response?.warning) {
      setStatus(response.warning, "warning");
    } else if (!state.voiceReplies) {
      setStatus("Response ready.", "success");
    }
  } catch (error) {
    state.awaitingReply = false;
    if (error?.name === "AbortError") {
      state.messages.pop();
      renderMessages();
      setStatus("Search and response interrupted.", "info");
      return;
    }
    state.messages[state.messages.length - 1] = {
      role: "assistant",
      content: "I could not reach the companion model right now. Try again in a moment, or continue in the text workspace.",
    };
    renderMessages();
    setStatus(error.message || "Could not send your message.");
  } finally {
    state.thinking = false;
    state.searching = false;
    state.chatAbortController = null;
    updateSignals();
    if (!state.voiceReplies) resumeContinuousListening();
    elements.messageInput.focus();
  }
}

function resetSession() {
  cancelSpeechPlayback();
  state.conversationId = "";
  localStorage.removeItem(getConversationStorageKey());
  state.messages = [];
  renderMessages();
  updateSignals();
  setStatus("New Meet Emora session started.", "success");
}

function switchCharacter(characterId) {
  const nextCharacterId = normalizeCharacterId(characterId);
  if (!CHARACTERS[nextCharacterId] || nextCharacterId === state.characterId) {
    return;
  }

  state.characterId = nextCharacterId;
  cancelSpeechPlayback();
  state.messages = [];
  renderCharacter();
  state.voiceName = currentCharacter().voiceGender ? `${currentCharacter().voiceGender} companion` : "Neural voice";
  renderMessages();
  updateSignals();
  setStatus(`${currentCharacter().name} is ready.`, "success");
}

async function welcomeUser() {
  const greeting = personalizedGreeting();
  state.avatarStage?.greet?.("wave");
  state.avatarStage?.setBrainBehavior?.({
    behavior: { attentionState: "excited", eyeContact: 0.86, gestureIntensity: 0.32 },
    emotion: { valence: 0.78, arousal: 0.52, engagement: 0.88 },
  });
  state.companionEmotion = "happy";
  renderMessages();
  updateSignals();

  // We attempt the actual companion voice on entry. Browsers that require an
  // explicit media gesture will fall back to the visible welcome and make the
  // Start talking control available without blocking the room.
  if (state.voiceReplies) {
    await speakReply(greeting);
  }
}

function bindEvents() {
  elements.characterSwitch.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-emora-character]") : null;
    if (button) {
      switchCharacter(button.dataset.emoraCharacter);
    }
  });

  elements.cameraButton.addEventListener("click", requestCamera);
  elements.micButton.addEventListener("click", () => { if (guardEntitlement("voice")) requestMic(); });
  elements.newSessionButton.addEventListener("click", resetSession);
  elements.interruptButton.addEventListener("click", () => {
    cancelSpeechPlayback();
    state.chatAbortController?.abort?.();
    state.chatAbortController = null;
    state.awaitingReply = false;
    state.searching = false;
    state.thinking = false;
    updateSignals();
    setStatus("Companion interrupted.", "info");
    if (state.voiceSessionActive) void startListening({ keepSession: true });
    else elements.messageInput.focus();
  });

  elements.listenButton.addEventListener("click", () => {
    if (!guardEntitlement("voice")) return;
    if (state.listening) {
      stopListening({ endSession: true });
      return;
    }
    startListening();
  });

  elements.composeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });

  elements.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  window.addEventListener("beforeunload", () => {
    publishEmoraPresence("LIVE");
    cancelSpeechPlayback();
    stopStream(state.cameraStream);
    stopStream(state.micStream);
    stopMicLevelMonitor();
  });
}

(async () => {
  initChrome();
  const session = await ensureSession({ redirectTo: "/login" });
  if (!session?.verified) {
    return;
  }

  state.user = getStoredUser();
  state.voiceReplies = hasStoredEntitlement("voice");
  state.voiceName = currentCharacter().voiceGender ? `${currentCharacter().voiceGender} companion` : "Neural voice";
  fillUserChrome();
  renderCharacter();
  renderMessages();
  updateSignals();
  bindEvents();
  if (!navigator.mediaDevices?.getUserMedia) {
    elements.cameraButton.disabled = true;
    elements.micButton.disabled = true;
    setStatus(getMediaUnavailableMessage(), "warning");
  }
  void initializeAvatarStage();
})();
