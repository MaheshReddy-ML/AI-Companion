import {
  COMPANION_PROFILES,
  accessDisplayForUser,
  apiRequest,
  buildShareText,
  copyText,
  createChatTitle,
  displayNameForUser,
  ensureSession,
  escapeHtml,
  formatMessageTime,
  formatSidebarTime,
  getConversationDraftKey,
  getToken,
  guardEntitlement,
  getStoredUser,
  initChrome,
  openExternal,
  renderUserAvatar,
  safeExternalUrl,
  showStatus,
} from "./common.js";

const SIDEBAR_STATE_KEY = "ai-companion:chat-sidebar-collapsed";

const elements = {
  chatLayout: document.querySelector(".chat-route-layout"),
  sidebar: document.getElementById("dashboard-sidebar"),
  sidebarToggle: document.getElementById("sidebar-toggle"),
  pinnedList: document.getElementById("pinned-conversations"),
  recentList: document.getElementById("recent-conversations"),
  sidebarUserAvatar: document.getElementById("sidebar-user-avatar"),
  sidebarUserName: document.getElementById("sidebar-user-name"),
  sidebarUserEmail: document.getElementById("sidebar-user-email"),
  sidebarPlanBadge: document.getElementById("sidebar-plan-badge"),
  sidebarWorkspaceBadge: document.getElementById("sidebar-workspace-badge"),
  statChats: document.getElementById("stat-chats"),
  statPinned: document.getElementById("stat-pinned"),
  statMessages: document.getElementById("stat-messages"),
  dashboardTitle: document.getElementById("dashboard-title"),
  dashboardSubtitle: document.getElementById("dashboard-subtitle"),
  chatStage: document.getElementById("chat-stage"),
  chatEmptyCopy: document.getElementById("chat-empty-copy"),
  activeChatTitle: document.getElementById("active-chat-title"),
  pinChatLabel: document.getElementById("pin-chat-label"),
  activeChatMeta: document.getElementById("active-chat-meta"),
  chatMessages: document.getElementById("chat-messages"),
  chatToast: document.getElementById("chat-toast"),
  messageInput: document.getElementById("message-input"),
  sendButton: document.getElementById("send-button"),
  micButton: document.getElementById("mic-button"),
  stopButton: document.getElementById("stop-button"),
  fileInput: document.getElementById("file-input"),
  cameraButton: document.getElementById("camera-button"),
  cameraRow: document.getElementById("camera-row"),
  cameraPreview: document.getElementById("camera-preview"),
  cameraStopButton: document.getElementById("camera-stop-button"),
  addContextButton: document.getElementById("add-context-button"),
  contextMenu: document.getElementById("context-menu"),
  attachmentRow: document.getElementById("attachment-row"),
  attachmentName: document.getElementById("attachment-name"),
  clearAttachment: document.getElementById("clear-attachment"),
  conversationSearch: document.getElementById("conversation-search"),
  newChatButton: document.getElementById("new-chat-button"),
  pinChatButton: document.getElementById("pin-chat-button"),
  shareChatButton: document.getElementById("share-chat-button"),
  exportChatButton: document.getElementById("export-chat-button"),
  postcardButton: document.getElementById("postcard-button"),
  companionToolsButton: document.getElementById("companion-tools-button"),
  companionTools: document.getElementById("companion-tools"),
  companionToolsClose: document.getElementById("companion-tools-close"),
  companionArrivalStatus: document.getElementById("companion-arrival-status"),
  companionEnvironmentGrid: document.getElementById("companion-environment-grid"),
  companionEnvironmentStatus: document.getElementById("companion-environment-status"),
  companionAmbience: document.getElementById("companion-ambience"),
  companionMemoryList: document.getElementById("companion-memory-list"),
  companionMemoryCount: document.getElementById("companion-memory-count"),
  companionMemoryForm: document.getElementById("companion-memory-form"),
  companionMemoryInput: document.getElementById("companion-memory-input"),
  companionMemoryStatus: document.getElementById("companion-memory-status"),
  collectionForm: document.getElementById("collection-form"),
  collectionInput: document.getElementById("collection-input"),
  collectionList: document.getElementById("collection-list"),
  companionModeStatus: document.getElementById("companion-mode-status"),
  messageLimit: document.getElementById("chat-message-limit"),
  remixJournalButton: document.getElementById("remix-journal-button"),
  sessionReflectionButton: document.getElementById("session-reflection-button"),
  sessionReflectionOutput: document.getElementById("session-reflection-output"),
  deleteChatButton: document.getElementById("delete-chat-button"),
  premiumButton: document.getElementById("premium-button"),
  settingsButton: document.getElementById("settings-button"),
  settingsShortcut: document.querySelector(".sidebar-settings-shortcut"),
  policyButton: document.getElementById("policy-button"),
  settingsModal: document.getElementById("settings-modal"),
  policyModal: document.getElementById("policy-modal"),
  premiumModal: document.getElementById("premium-modal"),
  settingsSessionCopy: document.getElementById("settings-session-copy"),
  clearDraftsButton: document.getElementById("clear-drafts-button"),
  settingsLogoutButton: document.getElementById("settings-logout-button"),
  premiumRequestButton: document.getElementById("premium-request-button"),
};

const state = {
  user: null,
  conversations: [],
  conversationSearch: "",
  activeConversationId: null,
  drafts: {},
  selectedFile: null,
  isThinking: false,
  isSearching: false,
  toastTimerId: null,
  activeModal: null,
  cameraStream: null,
  listening: false,
  recognition: null,
  requestController: null,
  space: { background: "forest", ambience: "none", accessory: "none" },
  environment: "midnight",
  availableEnvironments: [],
  preferences: {},
  collections: [],
  pendingCompanionMode: "listen",
  ambientAudio: null,
};

const MODE_LABELS = { listen: "Just listen", think: "Help me think", reflect: "Reflect with me", plan: "Gentle plan", quiet: "Quiet presence", distract: "Distract me", laugh: "Make me laugh", honest: "Be honest", focus: "Help me focus", deep: "Deep Conversation" };
const ENVIRONMENT_META = {
  midnight: { label: "Midnight", note: "Quiet indigo", mark: "✦" },
  dawn: { label: "Dawn", note: "Soft first light", mark: "◐" },
  "rainy-window": { label: "Rainy window", note: "Blue and reflective", mark: "⋮" },
  "quiet-forest": { label: "Quiet forest", note: "Grounded green", mark: "⌁" },
  "deep-ocean": { label: "Deep ocean", note: "Low and spacious", mark: "≈" },
  observatory: { label: "Observatory", note: "Focused starlight", mark: "⊹" },
  fireplace: { label: "Fireplace", note: "Warm and close", mark: "◇" },
  space: { label: "Deep space", note: "Distant violet", mark: "◌" },
  aurora: { label: "Aurora", note: "Luminous calm", mark: "∿" },
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function stopAmbientAudio() {
  state.ambientAudio?.source?.stop?.();
  state.ambientAudio?.context?.close?.().catch(() => {});
  state.ambientAudio = null;
}

async function startAmbientAudio(kind) {
  stopAmbientAudio();
  if (kind === "none") return;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) throw new Error("Ambient audio is not supported in this browser.");
  const context = new AudioContextCtor();
  const seconds = 4;
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let index = 0; index < data.length; index += 1) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.018 * white) / 1.018;
    data[index] = kind === "rain" ? white * .18 : brown * 2.6;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  filter.type = kind === "rain" ? "highpass" : "lowpass";
  filter.frequency.value = kind === "rain" ? 900 : kind === "ocean" ? 420 : kind === "fireplace" ? 680 : 520;
  gain.gain.value = kind === "night_wind" ? .08 : .11;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
  await context.resume();
  state.ambientAudio = { context, source };
}

async function startCameraCheckIn() {
  if (!state.preferences.visualInput) {
    showToast("Enable Visual emotion input in Profile settings first.", "warning");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Camera access is not available in this browser.", "error");
    return;
  }
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    elements.cameraPreview.srcObject = state.cameraStream;
    elements.cameraRow.hidden = false;
    elements.cameraButton.setAttribute("aria-pressed", "true");
    showToast("Camera is on. Only the frame sent with your next message is analyzed locally.", "info");
  } catch {
    showToast("Camera permission was not granted. You can keep chatting without it.", "warning");
  }
}

function stopCameraCheckIn() {
  state.cameraStream?.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
  if (elements.cameraPreview) elements.cameraPreview.srcObject = null;
  if (elements.cameraRow) elements.cameraRow.hidden = true;
  elements.cameraButton?.setAttribute("aria-pressed", "false");
}

function captureCameraFrame() {
  const video = elements.cameraPreview;
  if (!state.cameraStream || !video?.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, 640 / video.videoWidth, 480 / video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

initChrome();

function getDraftStorageKey() {
  return getConversationDraftKey(state.user);
}

function displayCompanionMessage(content) {
  // Hide the old model prefix in historic messages saved before the server
  // response guard was introduced.
  return String(content || "").replace(/^\s*(?:(?::|;|=)-?\(|:'\(|D:|☹️?|🙁|😞)\s*/i, "").trim();
}

function loadDrafts() {
  const raw = localStorage.getItem(getDraftStorageKey());
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return Object.fromEntries(Object.entries(parsed || {}).map(([key, value]) => [key, typeof value === "string" ? { text: value, savedAt: Date.now() } : value]));
  } catch {
    localStorage.removeItem(getDraftStorageKey());
    return {};
  }
}

function draftText(value) {
  return typeof value === "string" ? value : value?.text || "";
}

function draftRecord(text, clientTurnId = null) {
  return { text, savedAt: Date.now(), ...(clientTurnId ? { clientTurnId } : {}) };
}

function saveDrafts() {
  localStorage.setItem(getDraftStorageKey(), JSON.stringify(state.drafts));
}

function showToast(message, tone = "info") {
  showStatus(elements.chatToast, message, tone);
  if (state.toastTimerId) {
    window.clearTimeout(state.toastTimerId);
  }
  if (message) {
    state.toastTimerId = window.setTimeout(() => {
      showStatus(elements.chatToast, "");
      state.toastTimerId = null;
    }, 2800);
  }
}

function getModalElement(modalName) {
  if (modalName === "settings") {
    return elements.settingsModal;
  }
  if (modalName === "policy") {
    return elements.policyModal;
  }
  if (modalName === "premium") {
    return elements.premiumModal;
  }
  return null;
}

function closeModal(modalName = state.activeModal) {
  const modal = getModalElement(modalName);
  if (!modal) {
    return;
  }

  modal.hidden = true;
  if (state.activeModal === modalName) {
    state.activeModal = null;
    document.body.classList.remove("dashboard-modal-open");
  }
}

function openModal(modalName) {
  ["settings", "policy", "premium"].forEach((name) => {
    const modal = getModalElement(name);
    if (modal) {
      modal.hidden = name !== modalName;
    }
  });

  state.activeModal = modalName;
  document.body.classList.add("dashboard-modal-open");
}

function getOrderedConversations() {
  return [...state.conversations].sort((left, right) => {
    const pinnedOrder = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));
    if (pinnedOrder !== 0) {
      return pinnedOrder;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function getActiveConversation() {
  return state.conversations.find((conversation) => conversation.id === state.activeConversationId) || null;
}

function setActiveConversation(conversationId) {
  state.activeConversationId = conversationId;
  renderCollections();
  const draft = draftText(state.drafts[conversationId]);
  elements.messageInput.value = draft;
  resizeComposer();
  render();
}

function replaceConversation(nextConversation) {
  const existingIndex = state.conversations.findIndex((conversation) => conversation.id === nextConversation.id);
  if (existingIndex >= 0) {
    state.conversations[existingIndex] = nextConversation;
  } else {
    state.conversations.unshift(nextConversation);
  }
}

function removeConversation(conversationId) {
  state.conversations = state.conversations.filter((conversation) => conversation.id !== conversationId);
  delete state.drafts[conversationId];
  saveDrafts();

  if (state.activeConversationId === conversationId) {
    state.activeConversationId = getOrderedConversations()[0]?.id || null;
  }
}

function resizeComposer() {
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 220)}px`;
}

function getInitials(value) {
  const normalized = (value || "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return normalized || "AI";
}

function renderStats() {
  const totalMessages = state.conversations.reduce(
    (count, conversation) => count + (conversation.messages || []).length,
    0,
  );
  elements.statChats.textContent = String(state.conversations.length);
  elements.statPinned.textContent = String(state.conversations.filter((conversation) => conversation.pinned).length);
  elements.statMessages.textContent = String(totalMessages);
}

function renderSidebarMeta() {
  const userName = displayNameForUser(state.user);
  const userEmail = state.user?.email || "Signed in workspace";
  const conversationCount = state.conversations.length;
  const activeConversation = getActiveConversation();
  const accessDisplay = accessDisplayForUser(state.user);

  elements.sidebarUserName.textContent = userName;
  elements.sidebarUserEmail.textContent = accessDisplay.compact;
  renderUserAvatar(elements.sidebarUserAvatar, state.user, userName);
  elements.sidebarPlanBadge.textContent = state.user?.access?.isAdmin ? "FULL ACCESS" : `${accessDisplay.planName} Plan`;
  elements.sidebarWorkspaceBadge.textContent =
    activeConversation?.characterName
      ? `${activeConversation.characterName} active`
      : conversationCount > 0
        ? `${conversationCount} chats saved`
        : "Stable workspace";

  elements.settingsSessionCopy.textContent = `Signed in as ${userEmail}. Your dashboard is linked to this session.`;
}

function renderConversationItem(conversation) {
  const isActive = conversation.id === state.activeConversationId;

  return `
    <article class="conversation-card ${isActive ? "active" : ""}" data-conversation-id="${conversation.id}">
      <button class="conversation-main" type="button" data-action="select" data-id="${conversation.id}">
        <span class="conversation-title">${escapeHtml(conversation.title)}</span>
        <span class="conversation-meta">${escapeHtml(formatSidebarTime(conversation.updatedAt))}</span>
      </button>
      <div class="conversation-actions">
        <button class="mini-action" type="button" data-action="pin" data-id="${conversation.id}">
          ${conversation.pinned ? "Unpin" : "Pin"}
        </button>
        <button class="mini-action" type="button" data-action="share" data-id="${conversation.id}">
          Share
        </button>
        <button class="mini-action danger" type="button" data-action="delete" data-id="${conversation.id}">
          Delete
        </button>
      </div>
    </article>
  `;
}

function renderConversationLists() {
  const ordered = getOrderedConversations();
  const pinned = ordered.filter((conversation) => conversation.pinned);
  const recent = ordered.filter((conversation) => !conversation.pinned);

  elements.pinnedList.innerHTML = pinned.length
    ? pinned.map(renderConversationItem).join("")
    : '<p class="empty-list">No pinned conversations yet.</p>';

  elements.recentList.innerHTML = recent.length
    ? recent.map(renderConversationItem).join("")
    : '<p class="empty-list">No conversations yet.</p>';
}

function renderChatHeader() {
  const activeConversation = getActiveConversation();

  if (!activeConversation) {
    elements.activeChatTitle.textContent = "Emora";
    elements.activeChatMeta.textContent = "Present and ready to listen.";
    elements.pinChatButton.disabled = true;
    elements.pinChatLabel.textContent = "Pin";
    elements.shareChatButton.disabled = true;
    elements.exportChatButton.disabled = true;
    elements.postcardButton.disabled = true;
    elements.deleteChatButton.disabled = true;
    return;
  }

  elements.activeChatTitle.textContent = activeConversation.title;
  elements.activeChatMeta.textContent = `${activeConversation.characterName || "AI Companion"} • ${activeConversation.messages?.length || 0} messages`;
  elements.pinChatButton.disabled = false;
  elements.pinChatLabel.textContent = activeConversation.pinned ? "Unpin" : "Pin";
  elements.shareChatButton.disabled = false;
  elements.exportChatButton.disabled = false;
  elements.postcardButton.disabled = false;
  elements.deleteChatButton.disabled = false;
}

function renderWebSources(webSearch) {
  if (!webSearch?.searched) return "";
  const sources = Array.isArray(webSearch.sources) ? webSearch.sources : [];
  if (!sources.length) {
    return '<div class="web-source-status unavailable">Web check unavailable · no claims were guessed</div>';
  }
  return `
    <details class="web-source-panel">
      <summary>⌕ Searched the web · ${sources.length} source${sources.length === 1 ? "" : "s"}</summary>
      <div class="web-source-list">
        ${sources.map((source) => `
          <article><a href="${escapeHtml(safeExternalUrl(source.url))}" target="_blank" rel="noopener noreferrer">
            <strong>${escapeHtml(source.title || source.domain || "Source")}</strong>
            <span>${escapeHtml(source.domain || "")}</span>
          </a><button type="button" data-save-source data-source-url="${escapeHtml(safeExternalUrl(source.url, ""))}" data-source-title="${escapeHtml(source.title || source.domain || "Source")}" data-source-domain="${escapeHtml(source.domain || "")}">Save</button></article>`).join("")}
      </div>
    </details>`;
}

function renderMessages() {
  const activeConversation = getActiveConversation();

  if (!activeConversation) {
    elements.chatMessages.classList.add("is-empty");
    elements.chatMessages.innerHTML = "";
    elements.chatEmptyCopy.hidden = false;
    return;
  }

  if (!(activeConversation.messages || []).length) {
    elements.chatMessages.classList.add("is-empty");
    elements.chatMessages.innerHTML = "";
    elements.chatEmptyCopy.hidden = false;
    return;
  }

  elements.chatMessages.classList.remove("is-empty");
  elements.chatEmptyCopy.hidden = true;
  const userInitials = getInitials(displayNameForUser(state.user));
  const assistantInitials = getInitials(activeConversation.characterName || "AI Companion");

  const messagesMarkup = activeConversation.messages
    .map(
      (message) => `
        <article
          class="message-row ${message.role === "assistant" ? "assistant" : "user"}"
          data-avatar="${escapeHtml(message.role === "assistant" ? assistantInitials : userInitials)}"
        >
          <div class="bubble ${message.role === "assistant" ? "assistant" : "user"}">
            <div class="bubble-role">
              ${escapeHtml(message.role === "assistant" ? activeConversation.characterName || "AI Companion" : displayNameForUser(state.user))}
              <span>${escapeHtml(formatMessageTime(message.timestamp))}</span>
            </div>
            <p>${escapeHtml(message.role === "assistant" ? displayCompanionMessage(message.content) : message.content)}</p>
            ${message.role === "assistant" ? renderWebSources(message.webSearch) : ""}
            ${message.attachmentName ? `<button class="attachment-chip" type="button" data-download-attachment="${escapeHtml(message.attachmentId || "")}" ${message.attachmentId ? "" : "disabled"}>${escapeHtml(message.attachmentName)}</button>` : ""}
            ${message.id ? `<div class="message-actions"><button type="button" data-copy-message="${escapeHtml(message.id)}">Copy</button><button class="message-moment-action" type="button" data-save-moment="${escapeHtml(message.id)}">Keep as a moment</button>${message.role === "assistant" ? `<span>Private feedback · sent to Emora</span><button type="button" data-feedback-message="${escapeHtml(message.id)}" data-feedback-reason="helpful">Helpful</button><button type="button" data-feedback-message="${escapeHtml(message.id)}" data-feedback-reason="too_long">Too long</button><button type="button" data-feedback-message="${escapeHtml(message.id)}" data-feedback-reason="too_generic">Too generic</button><button type="button" data-feedback-message="${escapeHtml(message.id)}" data-feedback-reason="missed_request">Missed request</button><button type="button" data-feedback-message="${escapeHtml(message.id)}" data-feedback-reason="tone_wrong">Tone felt wrong</button><button type="button" data-feedback-message="${escapeHtml(message.id)}" data-feedback-reason="incorrect_or_unsafe">Incorrect or unsafe</button></div>` : "</div>"}` : ""}
          </div>
        </article>
      `,
    )
    .join("");

  const thinkingMarkup = state.isThinking
    ? `
      <article class="message-row assistant" data-avatar="${escapeHtml(assistantInitials)}">
        <div class="bubble assistant typing-bubble">
          <div class="typing-dots" aria-label="${state.isSearching ? "Emora is searching the web" : "Emora is thinking"}">
            <span></span><span></span><span></span>
          </div>
          ${state.isSearching ? '<div class="web-searching-label">⌕ Checking current sources…</div>' : ""}
        </div>
      </article>
    `
    : "";

  elements.chatMessages.innerHTML = messagesMarkup + thinkingMarkup;
  window.requestAnimationFrame(() => {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  });
}

function renderAttachment() {
  if (!state.selectedFile) {
    elements.attachmentRow.hidden = true;
    elements.attachmentName.textContent = "";
    return;
  }

  elements.attachmentRow.hidden = false;
  elements.attachmentName.textContent = state.selectedFile.name;
}

function renderDashboardSummary() {
  elements.dashboardTitle.textContent = `Welcome back, ${displayNameForUser(state.user)}`;
  elements.dashboardSubtitle.textContent =
    state.conversations.length > 0
      ? "Resume saved conversations or start a fresh thread with a more focused companion mode."
      : "Start with a new chat, a suggested prompt, or one of the built-in companion profiles.";
}

function render() {
  renderStats();
  renderSidebarMeta();
  renderConversationLists();
  renderChatHeader();
  renderMessages();
  renderAttachment();
  renderDashboardSummary();
  const companionState = state.isSearching ? "searching" : state.isThinking ? "thinking" : state.listening ? "listening" : "idle";
  elements.chatStage.dataset.companionState = companionState;
  elements.stopButton.hidden = !state.isThinking;
  elements.micButton.dataset.active = state.listening ? "true" : "false";
  const mode = getActiveConversation()?.companionMode || state.pendingCompanionMode;
  elements.chatStage.dataset.companionMode = mode;
  document.querySelectorAll("[data-companion-mode]").forEach((button) => {
    const selected = button.dataset.companionMode === mode;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("active", selected);
  });
  if (elements.companionModeStatus) elements.companionModeStatus.textContent = MODE_LABELS[mode] || MODE_LABELS.listen;
}

async function fetchConversations({ selectMostRecent = true } = {}) {
  const params = new URLSearchParams({ limit: "50" });
  if (state.conversationSearch.trim()) {
    params.set("search", state.conversationSearch.trim());
  }
  state.conversations = await apiRequest(`/api/chat?${params.toString()}`, { auth: true });
  const requestedConversation = new URLSearchParams(window.location.search).get("conversation");
  if (requestedConversation && state.conversations.some((item) => item.id === requestedConversation)) state.activeConversationId = requestedConversation;
  if (selectMostRecent && !state.activeConversationId && state.conversations.length > 0) {
    state.activeConversationId = getOrderedConversations()[0].id;
  } else if (state.activeConversationId && !state.conversations.some((item) => item.id === state.activeConversationId)) {
    state.activeConversationId = state.conversations[0]?.id || null;
  }
}

function renderCollections() {
  if (!elements.collectionList) return;
  const conversationId = state.activeConversationId;
  elements.collectionList.innerHTML = state.collections.length ? state.collections.map((item) => `<label><input type="checkbox" data-collection-id="${escapeHtml(item.id)}" ${conversationId && item.conversationIds.includes(conversationId) ? "checked" : ""} ${conversationId ? "" : "disabled"}><span><strong>${escapeHtml(item.name)}</strong><small>${item.conversationIds.length} conversation${item.conversationIds.length === 1 ? "" : "s"}</small></span><button type="button" data-delete-collection="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.name)}">×</button></label>`).join("") : "<p>Create a collection for conversations you want to revisit together.</p>";
}

async function loadCollections() {
  if (!elements.collectionList) return;
  const response = await apiRequest("/api/workspace/collections", { auth: true });
  state.collections = response.collections || [];
  renderCollections();
}

async function createConversation(payload = {}) {
  const conversation = await apiRequest("/api/chat/conversations", {
    method: "POST",
    auth: true,
    body: payload,
  });

  replaceConversation(conversation);
  state.activeConversationId = conversation.id;
  if (new URLSearchParams(window.location.search).get("new") === "1") {
    window.history.replaceState({}, "", "/chat");
  }
  render();
  return conversation;
}

async function togglePin(conversationId) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    return;
  }

  try {
    const updated = await apiRequest(`/api/chat/conversations/${conversationId}`, { method: "PATCH", auth: true, body: { pinned: !conversation.pinned, expectedVersion: conversation.version || 1 } });
    replaceConversation(updated); render();
  } catch (error) {
    if (error.status === 409) { window.alert("This conversation changed on another device. Emora will load the current server version before you choose again."); await fetchConversations({ selectMostRecent: false }); render(); return; }
    throw error;
  }
}

async function deleteConversation(conversationId) {
  await apiRequest(`/api/chat/conversations/${conversationId}`, {
    method: "DELETE",
    auth: true,
  });
  removeConversation(conversationId);
  render();
}

function persistDraftForActiveConversation() {
  if (!state.activeConversationId) {
    return;
  }
  const value = elements.messageInput.value;
  if (value.trim()) {
    state.drafts[state.activeConversationId] = draftRecord(value);
  } else {
    delete state.drafts[state.activeConversationId];
  }
  saveDrafts();
}

async function startCompanion(profileId) {
  const profile = COMPANION_PROFILES.find((item) => item.id === profileId);
  if (!profile) {
    return;
  }

  const conversation = await createConversation({
    title: `${profile.name} session`,
    characterId: profile.id,
    characterName: profile.name,
    personaPrompt: profile.personaPrompt,
    starterMessage: profile.greeting,
  });

  state.drafts[conversation.id] = draftRecord(profile.kickoffPrompt);
  saveDrafts();
  elements.messageInput.value = profile.kickoffPrompt;
  resizeComposer();
  render();
  showToast(`${profile.name} is ready.`, "success");
}

async function maybeConsumeStarterCharacter() {
  const starterCharacterId = localStorage.getItem("ai-companion:starter-character");
  if (!starterCharacterId) {
    return;
  }

  localStorage.removeItem("ai-companion:starter-character");
  await startCompanion(starterCharacterId);
}

async function shareConversation(conversation) {
  if (!conversation) {
    showToast("No active chat selected.", "error");
    return;
  }

  const text = buildShareText(conversation, displayNameForUser(state.user));
  if (!text) {
    showToast("This conversation has no messages to share.", "error");
    return;
  }

  if (navigator.share) {
    try {
      await navigator.share({
        title: conversation.title,
        text,
      });
      showToast("Shared successfully.", "success");
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
    }
  }

  await copyText(text);
  showToast(`Copied "${conversation.title}" to clipboard.`, "success");
}

async function exportConversation(conversation) {
  if (!guardEntitlement("conversation_export")) return;
  if (!conversation?.id) {
    showToast("Choose a saved conversation to export.", "error");
    return;
  }
  const response = await fetch(`/api/chat/conversations/${encodeURIComponent(conversation.id)}/export?format=text`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) {
    throw new Error("Could not export this conversation.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${conversation.title || "conversation"}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Conversation exported.", "success");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Could not read the attachment.")));
    reader.readAsDataURL(file);
  });
}

async function uploadSelectedAttachment(file) {
  if (!file) return null;
  const allowedTypes = ["application/pdf", "text/plain", "text/markdown", "image/png", "image/jpeg", "image/webp"];
  if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a PDF, text, Markdown, PNG, JPG, or WEBP file under 5 MB.");
  }
  const response = await apiRequest("/api/chat/attachments", {
    method: "POST",
    auth: true,
    body: { name: file.name, mediaType: file.type, dataUrl: await readFileAsDataUrl(file) },
  });
  return response?.attachment || null;
}

async function downloadAttachment(attachmentId) {
  if (!attachmentId) return;
  const response = await fetch(`/api/chat/attachments/${encodeURIComponent(attachmentId)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) throw new Error("Could not download this attachment.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "attachment";
  link.click();
  URL.revokeObjectURL(url);
}

async function playPostcard(conversation) {
  if (!guardEntitlement("voice_postcards")) return;
  if (!conversation?.id) throw new Error("Choose a conversation first.");
  const response = await fetch(`/api/play/postcard/${encodeURIComponent(conversation.id)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!response.ok) throw new Error("A voice postcard is not available for this conversation.");
  const url = URL.createObjectURL(await response.blob());
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
  await audio.play();
  showToast("Playing your companion postcard.", "success");
}

function setCompanionToolsOpen(open) {
  if (!elements.companionTools) return;
  elements.companionTools.hidden = !open;
  elements.companionToolsButton?.setAttribute("aria-expanded", String(open));
}

function renderEnvironmentChoices() {
  if (!elements.companionEnvironmentGrid) return;
  const available = state.availableEnvironments.length ? state.availableEnvironments : ["midnight", "dawn"];
  elements.companionEnvironmentGrid.innerHTML = available.map((name) => {
    const meta = ENVIRONMENT_META[name] || { label: name, note: "Personal atmosphere", mark: "✦" };
    const selected = name === state.environment;
    return `<button type="button" class="environment-choice environment-${escapeHtml(name)}" data-companion-environment="${escapeHtml(name)}" role="radio" aria-checked="${selected}" tabindex="${selected ? "0" : "-1"}"><i aria-hidden="true"><span>${meta.mark}</span></i><strong>${escapeHtml(meta.label)}</strong><small>${escapeHtml(meta.note)}</small><b>${selected ? "Selected" : "Choose"}</b></button>`;
  }).join("");
  const selectedMeta = ENVIRONMENT_META[state.environment];
  if (elements.companionEnvironmentStatus) elements.companionEnvironmentStatus.textContent = selectedMeta?.label || "Your space";
}

async function selectCompanionEnvironment(name) {
  if (!state.availableEnvironments.includes(name) || name === state.environment) return;
  const restoreFocus = elements.companionEnvironmentGrid?.contains(document.activeElement);
  const focusSelectedChoice = () => {
    if (restoreFocus) requestAnimationFrame(() => elements.companionEnvironmentGrid?.querySelector(`[data-companion-environment="${name}"]`)?.focus());
  };
  const previous = state.environment;
  state.environment = name;
  document.documentElement.dataset.emoraEnvironment = name;
  renderEnvironmentChoices();
  focusSelectedChoice();
  if (elements.companionEnvironmentStatus) elements.companionEnvironmentStatus.textContent = "Saving…";
  try {
    const response = await apiRequest("/api/experiences/space", { method: "PUT", auth: true, body: { environment: name } });
    state.environment = response.space?.environment || name;
    document.documentElement.dataset.emoraEnvironment = state.environment;
    renderEnvironmentChoices();
    focusSelectedChoice();
    showToast(`${ENVIRONMENT_META[state.environment]?.label || "Conversation"} atmosphere selected.`, "success");
  } catch (error) {
    state.environment = previous;
    document.documentElement.dataset.emoraEnvironment = previous;
    renderEnvironmentChoices();
    if (restoreFocus) requestAnimationFrame(() => elements.companionEnvironmentGrid?.querySelector(`[data-companion-environment="${previous}"]`)?.focus());
    showToast(error.message || "Could not change the conversation atmosphere.", "error");
  }
}

async function loadCompanionTools() {
  const [memoryData, spaceData, preferenceData, environmentData] = await Promise.all([
    apiRequest("/api/companion/memories", { auth: true }),
    apiRequest("/api/play/space", { auth: true }),
    apiRequest("/api/personal/preferences", { auth: true }),
    apiRequest("/api/experiences/space", { auth: true }),
  ]);
  state.preferences = preferenceData.preferences || {};
  const memories = memoryData.memories || [];
  elements.companionMemoryCount.textContent = `${memories.length} held with care`;
  elements.companionMemoryList.innerHTML = memories.length
    ? memories.slice(0, 8).map((memory) => `<article><p>${escapeHtml(memory.value)}</p><button type="button" data-edit-memory="${escapeHtml(memory.id)}" data-memory-value="${escapeHtml(memory.value)}">Edit</button><button type="button" data-forget-memory="${escapeHtml(memory.id)}">Forget</button></article>`).join("")
    : "<p>Nothing saved yet. Emora only keeps explicit, useful details.</p>";
  state.space = { ...state.space, ...(spaceData.space || {}) };
  state.environment = environmentData.space?.environment || "midnight";
  state.availableEnvironments = environmentData.space?.available || ["midnight", "dawn"];
  document.documentElement.dataset.emoraEnvironment = state.environment;
  renderEnvironmentChoices();
  elements.companionAmbience.value = state.space.ambience || "none";
  const entitlements = new Set(state.user?.access?.entitlements || []);
  elements.companionAmbience.querySelectorAll("[data-ambient-tier]").forEach((option) => {
    option.disabled = option.dataset.ambientTier === "plus" ? !entitlements.has("expanded_ambient") : !entitlements.has("ambient_rooms");
  });
  elements.chatStage.dataset.ambience = state.space.ambience || "none";
  if (elements.cameraButton) elements.cameraButton.hidden = !state.preferences.visualInput;
  if (!state.preferences.visualInput) stopCameraCheckIn();
  if (elements.companionMemoryInput) elements.companionMemoryInput.disabled = !state.preferences.emotionalMemory;
  if (elements.companionMemoryForm) elements.companionMemoryForm.querySelector("button").disabled = !state.preferences.emotionalMemory;
  if (!state.preferences.emotionalMemory && elements.companionMemoryStatus) elements.companionMemoryStatus.textContent = "Memory is paused in Profile settings.";
}

async function remixConversationToJournal() {
  if (!guardEntitlement("conversation_remix")) return;
  const conversation = getActiveConversation();
  const transcript = (conversation?.messages || []).map((message) => `${message.role === "assistant" ? "Emora" : "Me"}: ${message.content}`).join("\n\n").slice(0, 8000);
  if (!transcript) throw new Error("Have a conversation first, then bring it into your journal.");
  const remix = await apiRequest("/api/play/remix", { method: "POST", auth: true, body: { text: transcript, format: "journal" } });
  sessionStorage.setItem("emora:journal-remix", JSON.stringify({ title: conversation.title || "A conversation worth keeping", content: remix.content || transcript }));
  window.location.assign("/journal");
}

async function shareToChannel(conversation, channel) {
  const text = buildShareText(conversation, displayNameForUser(state.user));
  if (!text) {
    return;
  }

  if (channel === "whatsapp") {
    openExternal(`https://wa.me/?text=${encodeURIComponent(text)}`);
    showToast(`Shared "${conversation.title}" to WhatsApp.`, "success");
    return;
  }

  const compactText = text.replace(/\s+/g, " ").trim();
  const xText = compactText.length > 260 ? `${compactText.slice(0, 257)}...` : compactText;
  openExternal(`https://x.com/intent/tweet?text=${encodeURIComponent(xText)}`);
  showToast(`Shared "${conversation.title}" to X.`, "success");
}

async function handleSend(promptOverride = null) {
  if (state.isThinking) {
    return;
  }

  const draft = (promptOverride ?? elements.messageInput.value).trim();
  const selectedFile = state.selectedFile;
  const attachmentName = selectedFile?.name || null;
  if (!draft && !attachmentName) {
    return;
  }

  let activeConversation = getActiveConversation();
  if (!activeConversation) {
    activeConversation = await createConversation({ title: "New conversation" });
  }

  const outgoingContent = draft || `Shared file: ${attachmentName}`;
  const cameraFrame = captureCameraFrame();
  const existingDraft = state.drafts[activeConversation.id];
  const clientTurnId = existingDraft?.clientTurnId || `turn-${crypto.randomUUID()}`;
  const snapshot = JSON.parse(JSON.stringify(activeConversation));
  const optimisticMessage = {
    id: clientTurnId,
    clientTurnId,
    role: "user",
    content: outgoingContent,
    attachmentName,
    timestamp: new Date().toISOString(),
  };

  activeConversation.messages = [...(activeConversation.messages || []), optimisticMessage];
  activeConversation.updatedAt = optimisticMessage.timestamp;
  if (!snapshot.messages?.length || snapshot.title === "New conversation") {
    activeConversation.title = createChatTitle(outgoingContent);
  }
  replaceConversation(activeConversation);

  delete state.drafts[activeConversation.id];
  saveDrafts();
  elements.messageInput.value = "";
  resizeComposer();
  state.selectedFile = null;
  state.isThinking = true;
  state.requestController = new AbortController();
  render();

  try {
    const attachment = await uploadSelectedAttachment(selectedFile);
    try {
      const decision = await apiRequest("/api/chat/search-decision", {
        method: "POST", auth: true, body: { message: outgoingContent }, signal: state.requestController.signal,
      });
      state.isSearching = Boolean(decision?.needsWeb);
      render();
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      state.isSearching = false;
    }
    const response = await apiRequest("/api/chat", {
      method: "POST",
      auth: true,
      body: {
        clientTurnId,
        conversationId: activeConversation.id,
        message: draft,
        attachmentName,
        attachmentId: attachment?.id || null,
        personaPrompt: activeConversation.personaPrompt || null,
        characterName: activeConversation.characterName || null,
        companionMode: activeConversation.companionMode || state.pendingCompanionMode,
        cameraOptIn: Boolean(cameraFrame),
        cameraFrame,
      },
      signal: state.requestController.signal,
    });

    replaceConversation(response.conversation);
    if (response.warning) {
      showToast(response.warning, "warning");
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      replaceConversation(snapshot);
      return;
    }
    replaceConversation(snapshot);
    state.drafts[activeConversation.id] = draftRecord(draft, clientTurnId);
    saveDrafts();
    elements.messageInput.value = draft;
    resizeComposer();
    showToast(error.message || "Failed to get a response.", "error");
  } finally {
    state.isThinking = false;
    state.isSearching = false;
    state.requestController = null;
    render();
  }
}

function bindStaticEvents() {
  const closeContextMenu = () => {
    if (!elements.contextMenu || !elements.addContextButton) return;
    elements.contextMenu.hidden = true;
    elements.addContextButton.setAttribute("aria-expanded", "false");
  };

  const setSidebarCollapsed = (collapsed, { persist = true } = {}) => {
    elements.chatLayout?.classList.toggle("sidebar-collapsed", collapsed);
    elements.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
    elements.sidebarToggle?.setAttribute("aria-label", collapsed ? "Open sidebar" : "Collapse sidebar");
    elements.sidebarToggle?.setAttribute("title", collapsed ? "Open sidebar" : "Collapse sidebar");
    if (persist) localStorage.setItem(SIDEBAR_STATE_KEY, String(collapsed));
  };

  setSidebarCollapsed(localStorage.getItem(SIDEBAR_STATE_KEY) === "true", { persist: false });
  elements.sidebarToggle?.addEventListener("click", () => {
    setSidebarCollapsed(!elements.chatLayout?.classList.contains("sidebar-collapsed"));
  });

  elements.addContextButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = Boolean(elements.contextMenu?.hidden);
    if (elements.contextMenu) elements.contextMenu.hidden = !willOpen;
    elements.addContextButton.setAttribute("aria-expanded", String(willOpen));
  });
  elements.contextMenu?.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", closeContextMenu);
  elements.settingsShortcut?.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = elements.sidebar?.classList.toggle("utility-menu-open") || false;
    elements.settingsShortcut.setAttribute("aria-expanded", String(isOpen));
  });
  document.querySelector(".companion-secondary-actions")?.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => {
    elements.sidebar?.classList.remove("utility-menu-open");
    elements.settingsShortcut?.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeContextMenu();
      elements.sidebar?.classList.remove("utility-menu-open");
      elements.settingsShortcut?.setAttribute("aria-expanded", "false");
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.conversationSearch?.focus();
    }
  });

  elements.messageInput.addEventListener("input", () => {
    persistDraftForActiveConversation();
    resizeComposer();
  });

  let searchTimer = null;
  elements.conversationSearch?.addEventListener("input", () => {
    state.conversationSearch = elements.conversationSearch.value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(async () => {
      await fetchConversations();
      render();
    }, 220);
  });

  elements.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });

  document.querySelectorAll("[data-chat-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.messageInput.value = button.dataset.chatPrompt || "";
      persistDraftForActiveConversation();
      resizeComposer();
      elements.messageInput.focus();
    });
  });

  elements.companionToolsButton?.addEventListener("click", async () => {
    const open = Boolean(elements.companionTools?.hidden);
    setCompanionToolsOpen(open);
    if (open) {
      try { await loadCompanionTools(); } catch (error) { showToast(error.message || "Could not load companion options.", "error"); }
    }
  });
  elements.companionToolsClose?.addEventListener("click", () => setCompanionToolsOpen(false));
  document.querySelectorAll("[data-companion-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextMode = button.dataset.companionMode || "listen";
      if (nextMode === "deep" && !guardEntitlement("deep_conversation")) return;
      const conversation = getActiveConversation();
      const previousMode = conversation?.companionMode || state.pendingCompanionMode;
      state.pendingCompanionMode = nextMode;
      if (conversation) conversation.companionMode = nextMode;
      render();
      try {
        if (conversation) {
          const updated = await apiRequest(`/api/chat/conversations/${conversation.id}`, { method: "PATCH", auth: true, body: { companionMode: nextMode, expectedVersion: conversation.version || 1 } });
          replaceConversation(updated);
        }
        showToast(`${MODE_LABELS[nextMode]} mode selected.`, "success");
      } catch (error) {
        state.pendingCompanionMode = previousMode;
        if (conversation) conversation.companionMode = previousMode;
        showToast(error.message || "Could not change response mode.", "error");
      }
      render();
    });
  });
  document.querySelectorAll("[data-arrival-mood]").forEach((button) => {
    button.addEventListener("click", async () => {
      document.querySelectorAll("[data-arrival-mood]").forEach((item) => item.classList.toggle("selected", item === button));
      elements.companionArrivalStatus.textContent = "Saving…";
      try {
        await apiRequest("/api/personal/check-ins", { method: "POST", auth: true, body: { mood: button.dataset.arrivalMood } });
        elements.companionArrivalStatus.textContent = "Saved privately. You can talk, or simply stay here.";
      } catch (error) {
        elements.companionArrivalStatus.textContent = error.message || "Could not save this check-in.";
      }
    });
  });
  elements.companionEnvironmentGrid?.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-companion-environment]");
    if (choice) selectCompanionEnvironment(choice.dataset.companionEnvironment);
  });
  elements.companionEnvironmentGrid?.addEventListener("keydown", (event) => {
    const choices = [...elements.companionEnvironmentGrid.querySelectorAll("[data-companion-environment]")];
    const current = event.target.closest("[data-companion-environment]");
    const currentIndex = choices.indexOf(current);
    if (currentIndex < 0 || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? choices.length - 1
        : (currentIndex + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + choices.length) % choices.length;
    choices[nextIndex]?.focus();
    choices[nextIndex]?.click();
  });
  elements.companionAmbience?.addEventListener("change", async () => {
    const previous = state.space.ambience;
    state.space.ambience = elements.companionAmbience.value;
    try {
      await apiRequest("/api/play/space", { method: "PUT", auth: true, body: state.space });
      elements.chatStage.dataset.ambience = state.space.ambience;
      await startAmbientAudio(state.space.ambience);
      showToast(state.space.ambience === "none" ? "Ambient sound stopped." : "Ambient sound is playing locally.", "success");
    } catch (error) {
      state.space.ambience = previous;
      elements.companionAmbience.value = previous;
      showToast(error.message || "Could not save the room atmosphere.", "error");
    }
  });
  window.addEventListener("pagehide", stopAmbientAudio, { once: true });
  elements.companionMemoryList?.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-memory]");
    if (editButton) {
      const value = window.prompt("Update what Emora remembers:", editButton.dataset.memoryValue || "")?.trim();
      if (!value || value === editButton.dataset.memoryValue) return;
      try {
        await apiRequest(`/api/companion/memories/${editButton.dataset.editMemory}`, { method: "PATCH", auth: true, body: { value } });
        showToast("Memory updated.", "success");
        await loadCompanionTools();
      } catch (error) {
        showToast(error.message || "Could not update this memory.", "error");
      }
      return;
    }
    const button = event.target.closest("[data-forget-memory]");
    if (!button) return;
    try {
      await apiRequest(`/api/companion/memories/${button.dataset.forgetMemory}`, { method: "DELETE", auth: true });
      await loadCompanionTools();
    } catch (error) {
      showToast(error.message || "Could not remove this memory.", "error");
    }
  });
  elements.companionMemoryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!guardEntitlement("companion_memory")) return;
    const value = elements.companionMemoryInput.value.trim();
    if (!value) return;
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    elements.companionMemoryStatus.textContent = "Saving…";
    try {
      await apiRequest("/api/companion/memories", { method: "POST", auth: true, body: { value } });
      elements.companionMemoryInput.value = "";
      elements.companionMemoryStatus.textContent = "Saved. You can forget it at any time.";
      await loadCompanionTools();
    } catch (error) {
      elements.companionMemoryStatus.textContent = error.message || "Could not save this memory.";
    } finally {
      button.disabled = !state.preferences.emotionalMemory;
    }
  });
  elements.remixJournalButton?.addEventListener("click", async () => {
    try { await remixConversationToJournal(); } catch (error) { showToast(error.message || "Could not create a journal draft.", "error"); }
  });
  elements.sessionReflectionButton?.addEventListener("click", async () => {
    if (!guardEntitlement("session_reflection")) return;
    const conversation = getActiveConversation();
    if (!conversation?.id || !(conversation.messages || []).some((message) => message.role === "user")) {
      showToast("Have a conversation first, then ask Emora to reflect it back.", "warning");
      return;
    }
    elements.sessionReflectionButton.disabled = true;
    elements.sessionReflectionOutput.textContent = "Reflecting only what was actually said…";
    try {
      const result = await apiRequest("/api/companion/reflections", { method: "POST", auth: true, body: { conversationId: conversation.id } });
      elements.sessionReflectionOutput.textContent = result.reflection;
    } catch (error) {
      elements.sessionReflectionOutput.textContent = error.message || "This reflection could not be created right now.";
    } finally {
      elements.sessionReflectionButton.disabled = false;
    }
  });

  elements.sendButton.addEventListener("click", () => handleSend());
  elements.stopButton.addEventListener("click", () => {
    state.requestController?.abort();
    state.isThinking = false;
    render();
    showToast("Companion interrupted.", "info");
  });
  elements.micButton.addEventListener("click", () => {
    if (!guardEntitlement("voice")) return;
    if (!SpeechRecognition) { showToast("Voice input is not supported in this browser.", "warning"); return; }
    if (!state.recognition) {
      state.recognition = new SpeechRecognition();
      state.recognition.interimResults = true;
      state.recognition.addEventListener("result", (event) => {
        elements.messageInput.value = Array.from(event.results).map((item) => item[0].transcript).join("").trim();
        resizeComposer();
      });
      state.recognition.addEventListener("end", () => { state.listening = false; render(); });
      state.recognition.addEventListener("error", () => { state.listening = false; render(); });
    }
    if (state.listening) { state.recognition.stop(); return; }
    state.listening = true;
    state.recognition.start();
    render();
  });
  elements.cameraButton?.addEventListener("click", () => {
    closeContextMenu();
    if (state.cameraStream) stopCameraCheckIn();
    else startCameraCheckIn();
  });
  elements.cameraStopButton?.addEventListener("click", stopCameraCheckIn);
  window.addEventListener("pagehide", stopCameraCheckIn, { once: true });

  elements.chatMessages.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-copy-message]");
    if (copyButton) {
      const message = getActiveConversation()?.messages?.find((item) => item.id === copyButton.dataset.copyMessage);
      if (message) {
        await copyText(message.content || "");
        copyButton.textContent = "Copied";
        window.setTimeout(() => { copyButton.textContent = "Copy"; }, 1200);
      }
      return;
    }
    const sourceButton = event.target.closest("[data-save-source]");
    if (sourceButton) {
      try {
        await apiRequest("/api/workspace/research-shelf", { method: "POST", auth: true, body: { title: sourceButton.dataset.sourceTitle, url: sourceButton.dataset.sourceUrl, domain: sourceButton.dataset.sourceDomain, note: "", tags: [] } });
        sourceButton.textContent = "Saved"; sourceButton.disabled = true; showToast("Source saved to your Research shelf.", "success");
      } catch (error) { showToast(error.message || "Could not save this source.", "error"); }
      return;
    }
    const feedbackButton = event.target.closest("[data-feedback-message]");
    if (feedbackButton) {
      const conversation = getActiveConversation();
      try {
        await apiRequest("/api/workspace/feedback", { method: "PUT", auth: true, body: { conversationId: conversation.id, messageId: feedbackButton.dataset.feedbackMessage, reason: feedbackButton.dataset.feedbackReason } });
        feedbackButton.closest(".message-actions").querySelectorAll("[data-feedback-message]").forEach((button) => button.classList.toggle("selected", button === feedbackButton));
        showToast("Private feedback saved. It will not be posted publicly.", "success");
      } catch (error) { showToast(error.message || "Could not save feedback.", "error"); }
      return;
    }
    const momentButton = event.target.closest("[data-save-moment]");
    if (momentButton) {
      const conversation = getActiveConversation();
      try {
        const result = await apiRequest("/api/experiences/moments", { method: "POST", auth: true, body: { conversationId: conversation.id, messageId: momentButton.dataset.saveMoment, category: "memory" } });
        momentButton.textContent = result.created ? "Moment kept" : "Already kept";
        momentButton.disabled = true;
      } catch (error) { showToast(error.message || "Could not keep this moment.", "error"); }
      return;
    }
    const button = event.target.closest("[data-download-attachment]");
    if (!button?.dataset.downloadAttachment) return;
    try {
      await downloadAttachment(button.dataset.downloadAttachment);
    } catch (error) {
      showToast(error.message || "Could not download this attachment.", "error");
    }
  });

  elements.fileInput.addEventListener("change", () => {
    if (!guardEntitlement("extended_chat")) {
      elements.fileInput.value = "";
      return;
    }
    closeContextMenu();
    state.selectedFile = elements.fileInput.files?.[0] || null;
    renderAttachment();
  });

  elements.clearAttachment.addEventListener("click", () => {
    state.selectedFile = null;
    elements.fileInput.value = "";
    renderAttachment();
  });

  elements.collectionForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const response = await apiRequest("/api/workspace/collections", { method: "POST", auth: true, body: { name: elements.collectionInput.value } });
      state.collections.unshift(response.collection); elements.collectionInput.value = ""; renderCollections();
    } catch (error) { showToast(error.message || "Could not create the collection.", "error"); }
  });
  elements.collectionList?.addEventListener("change", async (event) => {
    const input = event.target.closest("[data-collection-id]");
    if (!input || !state.activeConversationId) return;
    try {
      const response = await apiRequest(`/api/workspace/collections/${input.dataset.collectionId}/conversation`, { method: "PUT", auth: true, body: { conversationId: state.activeConversationId, included: input.checked } });
      state.collections = state.collections.map((item) => item.id === response.collection.id ? response.collection : item); renderCollections();
    } catch (error) { input.checked = !input.checked; showToast(error.message || "Could not update the collection.", "error"); }
  });
  elements.collectionList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-collection]");
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    if (!window.confirm("Delete this collection? Its conversations will be kept.")) return;
    try { await apiRequest(`/api/workspace/collections/${button.dataset.deleteCollection}`, { method: "DELETE", auth: true }); state.collections = state.collections.filter((item) => item.id !== button.dataset.deleteCollection); renderCollections(); }
    catch (error) { showToast(error.message || "Could not delete the collection.", "error"); }
  });

  elements.newChatButton.addEventListener("click", async () => {
    await createConversation({ title: "New conversation" });
    elements.messageInput.value = "";
    resizeComposer();
    render();
  });

  elements.pinChatButton.addEventListener("click", async () => {
    const activeConversation = getActiveConversation();
    if (activeConversation) {
      await togglePin(activeConversation.id);
    }
  });

  elements.deleteChatButton.addEventListener("click", async () => {
    const activeConversation = getActiveConversation();
    if (activeConversation) {
      await deleteConversation(activeConversation.id);
    }
  });

  elements.shareChatButton.addEventListener("click", async () => {
    await shareConversation(getActiveConversation());
  });

  elements.exportChatButton.addEventListener("click", async () => {
    try {
      await exportConversation(getActiveConversation());
    } catch (error) {
      showToast(error.message || "Could not export this conversation.", "error");
    }
  });

  elements.postcardButton.addEventListener("click", async () => {
    try { await playPostcard(getActiveConversation()); } catch (error) { showToast(error.message, "error"); }
  });

  elements.settingsButton.addEventListener("click", () => {
    openModal("settings");
  });

  elements.policyButton.addEventListener("click", () => {
    openModal("policy");
  });

  elements.premiumButton?.addEventListener("click", () => {
    window.location.assign("/payment");
  });

  elements.clearDraftsButton.addEventListener("click", () => {
    state.drafts = {};
    saveDrafts();
    if (state.activeConversationId) {
      elements.messageInput.value = "";
      resizeComposer();
    }
    showToast("Local drafts cleared for this account.", "success");
    render();
  });

  elements.settingsLogoutButton.addEventListener("click", () => {
    document.querySelector("[data-logout]")?.click();
  });

  elements.premiumRequestButton.addEventListener("click", () => {
    window.location.assign("/payment");
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal(button.dataset.closeModal);
    });
  });

  [elements.settingsModal, elements.policyModal, elements.premiumModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });


  [elements.pinnedList, elements.recentList].forEach((container) => {
    container.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) {
        return;
      }

      const conversationId = actionButton.dataset.id;
      const action = actionButton.dataset.action;
      const conversation = state.conversations.find((item) => item.id === conversationId);

      if (action === "select") {
        setActiveConversation(conversationId);
        return;
      }

      if (!conversation) {
        return;
      }

      if (action === "pin") {
        await togglePin(conversationId);
        return;
      }

      if (action === "delete") {
        await deleteConversation(conversationId);
        return;
      }

      if (action === "share") {
        if (event.shiftKey) {
          await shareToChannel(conversation, "whatsapp");
        } else if (event.altKey) {
          await shareToChannel(conversation, "x");
        } else {
          await shareConversation(conversation);
        }
      }
    });
  });
}

(async () => {
  const session = await ensureSession({ redirectTo: "/login" });
  if (!session?.verified) {
    return;
  }

  state.user = getStoredUser();
  state.drafts = loadDrafts();
  const messageCharacters = Number(state.user?.access?.limits?.chatMessageCharacters || 2000);
  elements.messageInput.maxLength = messageCharacters;
  if (elements.messageLimit) elements.messageLimit.textContent = `${state.user?.access?.planName || "Free"} messages up to ${messageCharacters.toLocaleString()} characters`;

  bindStaticEvents();
  // The core composer must not depend on optional memory, ambience, or
  // preference endpoints. Render and accept input while those panels load.
  render();

  const entryParams = new URLSearchParams(window.location.search);
  const shouldStartFresh = entryParams.get("new") === "1";
  const [conversationsResult, toolsResult] = await Promise.allSettled([
    fetchConversations({ selectMostRecent: !shouldStartFresh }),
    Promise.all([loadCompanionTools(), loadCollections()]),
  ]);
  if (conversationsResult.status === "rejected") {
    console.error("Could not load saved conversations.", conversationsResult.reason);
    showToast("Saved conversations could not load, but you can still start a new chat.", "warning");
  }
  if (toolsResult.status === "rejected") {
    console.error("Could not load companion tools.", toolsResult.reason);
  }

  try {
    await maybeConsumeStarterCharacter();
  } catch (error) {
    console.error("Could not prepare the selected companion.", error);
    showToast(error.message || "Could not prepare the selected companion.", "warning");
  }

  if (!shouldStartFresh && !state.activeConversationId && state.conversations.length > 0) {
    state.activeConversationId = getOrderedConversations()[0].id;
  }
  renderCollections();

  const entryPrompt = (entryParams.get("prompt") || "").slice(0, messageCharacters);
  let restoredPrompt = "";
  try {
    const restored = JSON.parse(sessionStorage.getItem("emora:restore-device-draft") || "null");
    if (restored?.type === "chat") restoredPrompt = String(restored.text || "").slice(0, messageCharacters);
    if (restoredPrompt) sessionStorage.removeItem("emora:restore-device-draft");
  } catch { sessionStorage.removeItem("emora:restore-device-draft"); }
  elements.messageInput.value = restoredPrompt || entryPrompt || (state.activeConversationId ? draftText(state.drafts[state.activeConversationId]) : "");
  resizeComposer();
  render();
})();
