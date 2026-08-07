// Voice Backend Integration - local Qwen3 MLX PCM streaming with Kokoro fallback

import {
  apiRequest,
  displayNameForUser,
  ensureSession,
  escapeHtml,
  getToken,
  getInitials,
  getStoredUser,
  initChrome,
  renderUserAvatar,
  showStatus,
} from "./common.js";
import { createEmoraAvatarStage } from "./emora-avatar-stage.js?v=20260715-full-body-framing";

const ASSET_VERSION = "20260511-anime-vroid";

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
  status: document.getElementById("emora-status"),
  listeningSignal: document.getElementById("emora-listening-signal"),
  visionSignal: document.getElementById("emora-vision-signal"),
  voiceSignal: document.getElementById("emora-voice-signal"),
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
  thinking: false,
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
  audioLevelRaf: 0,
  speechAbortController: null,
  streamSources: new Set(),
  streamPlaybackTimer: null,
  streamGeneration: 0,
  lipSyncTimer: null,
  lipSyncRestTimer: null,
  silentSpeechTimer: null,
  lipSyncIndex: 0,
};

function currentCharacter() {
  return CHARACTERS[state.characterId] || CHARACTERS.Yuna;
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
  state.avatarStage?.setCharacter(character).catch(() => {
    setStatus("Could not load the 3D character. Check your connection and try again.", "warning");
  });

  elements.characterSwitch.querySelectorAll("[data-emora-character]").forEach((button) => {
    const isActive = button.dataset.emoraCharacter === character.id;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  if (!state.messages.length) {
    state.messages = [{ role: "assistant", content: character.greeting }];
  }
}

function renderMessages() {
  elements.transcript.innerHTML = state.messages
    .map(
      (message) => `
        <article class="emora-message ${message.role}">
          <span>${escapeHtml(message.role === "assistant" ? currentCharacter().name : displayNameForUser(state.user))}</span>
          <p>${escapeHtml(message.content)}</p>
        </article>
      `,
    )
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
  elements.listeningSignal.textContent = state.listening ? "Listening" : state.thinking ? "Thinking" : state.speechLoading ? "Voicing" : "Idle";
  elements.visionSignal.textContent = cameraOn ? "Ready" : "Off";
  elements.voiceSignal.textContent = state.voiceReplies ? currentCharacter().voiceLabel || `Soft ${currentCharacter().voiceGender || "voice"}` : "Off";
  elements.voiceSignal.title = state.voiceName ? `Using ${state.voiceName}` : "";
  elements.listenButton.textContent = state.listening ? "Stop talking" : "Start talking";
  elements.listenButton.disabled = state.thinking;
  elements.sendButton.disabled = state.thinking;
  elements.messageInput.disabled = state.thinking;
  elements.stage.dataset.speaking = state.speaking ? "true" : "false";
  state.avatarStage?.setListening(state.listening);
  state.avatarStage?.setThinking((state.thinking || state.speechLoading) && !state.speaking);
}

function setStatus(message, tone = "info") {
  showStatus(elements.status, message, tone);
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
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
    stopListening();
    stopStream(state.micStream);
    state.micStream = null;
    setStatus("Microphone stopped.", "info");
    updateSignals();
    return false;
  }

  try {
    state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
    if (finalTranscript.trim()) {
      stopListening();
      sendMessage(finalTranscript.trim());
    }
  });

  recognition.addEventListener("error", () => {
    state.listening = false;
    setStatus("Speech capture stopped. You can still type below.", "warning");
    updateSignals();
  });

  recognition.addEventListener("end", () => {
    state.listening = false;
    updateSignals();
  });

  return recognition;
}

async function startListening() {
  if (state.thinking) {
    return;
  }

  if (!SpeechRecognition) {
    setStatus("Speech recognition is not available in this browser. Use typed chat here.", "warning");
    return;
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

  try {
    state.listening = true;
    state.recognition.start();
    setStatus("Listening...", "info");
  } catch {
    state.listening = false;
  } finally {
    updateSignals();
  }
}

function stopListening() {
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
    state.avatarStage?.setBrainBehavior?.(brain);
    state.avatarStage?.setSpeaking(true, text);
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
    }, finishInMs);
  } catch (error) {
    if (error?.name === "AbortError") return;
    state.avatarStage?.setBrainBehavior?.(brain);
    startSilentPerformance(text);
    setStatus("Voice is unavailable, so the companion is responding silently.", "warning");
  }
}

async function requestCompanionReply(content) {
  const character = currentCharacter();
  return apiRequest("/api/chat", {
    method: "POST",
    auth: true,
    body: {
      conversationId: state.conversationId || undefined,
      message: content,
      characterId: character.id,
      characterName: `Your Emora - ${character.name}`,
      personaPrompt: buildPersonaPrompt(),
    },
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
  state.thinking = true;
  elements.messageInput.value = "";
  state.messages.push({ role: "user", content });
  state.messages.push({ role: "assistant", content: `${character.name} is thinking...` });
  renderMessages();
  updateSignals();

  try {
    let response;
    try {
      response = await requestCompanionReply(content);
    } catch (error) {
      if (error.status !== 404 || !state.conversationId) {
        throw error;
      }
      localStorage.removeItem(getConversationStorageKey());
      state.conversationId = "";
      response = await requestCompanionReply(content);
    }

    state.conversationId = response?.conversation?.id || state.conversationId;
    if (state.conversationId) {
      localStorage.setItem(getConversationStorageKey(), state.conversationId);
    }

    const reply = response?.aiMessage?.message || response?.aiMessage?.content || "I am here with you.";
    const brain = response?.brain || response?.aiMessage?.brain || null;
    state.messages[state.messages.length - 1] = { role: "assistant", content: reply };
    renderMessages();
    if (brain) {
      state.avatarStage?.setBrainBehavior?.(brain);
      await performThinkingMoment(brain);
    }
    void speakReply(reply, brain);
    if (response?.warning) {
      setStatus(response.warning, "warning");
    } else if (!state.voiceReplies) {
      setStatus("Response ready.", "success");
    }
  } catch (error) {
    state.messages[state.messages.length - 1] = {
      role: "assistant",
      content: "I could not reach the companion model right now. Try again in a moment, or continue in the text workspace.",
    };
    renderMessages();
    setStatus(error.message || "Could not send your message.");
  } finally {
    state.thinking = false;
    updateSignals();
    elements.messageInput.focus();
  }
}

function resetSession() {
  cancelSpeechPlayback();
  state.conversationId = "";
  localStorage.removeItem(getConversationStorageKey());
  state.messages = [{ role: "assistant", content: currentCharacter().greeting }];
  renderMessages();
  updateSignals();
  setStatus("New Your Emora session started.", "success");
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

function bindEvents() {
  elements.characterSwitch.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-emora-character]") : null;
    if (button) {
      switchCharacter(button.dataset.emoraCharacter);
    }
  });

  elements.cameraButton.addEventListener("click", requestCamera);
  elements.micButton.addEventListener("click", requestMic);
  elements.newSessionButton.addEventListener("click", resetSession);

  elements.listenButton.addEventListener("click", () => {
    if (state.listening) {
      stopListening();
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
    cancelSpeechPlayback();
    stopStream(state.cameraStream);
    stopStream(state.micStream);
  });
}

(async () => {
  initChrome();
  const session = await ensureSession({ redirectTo: "/login" });
  if (!session?.verified) {
    return;
  }

  state.user = getStoredUser();
  try {
    state.avatarStage = createEmoraAvatarStage(elements.characterCrop);
  } catch (error) {
    setStatus("3D rendering is not available in this browser.", "warning");
  }
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
})();
