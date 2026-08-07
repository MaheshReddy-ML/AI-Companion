import {
  COMPANION_PROFILES,
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
  getStoredUser,
  initChrome,
  openExternal,
  renderUserAvatar,
  showStatus,
} from "./common.js";

const elements = {
  sidebar: document.getElementById("dashboard-sidebar"),
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
  companionShelf: document.getElementById("companion-shelf"),
  companionGrid: document.getElementById("companion-grid"),
  activeChatTitle: document.getElementById("active-chat-title"),
  activeChatMeta: document.getElementById("active-chat-meta"),
  chatMessages: document.getElementById("chat-messages"),
  chatToast: document.getElementById("chat-toast"),
  messageInput: document.getElementById("message-input"),
  sendButton: document.getElementById("send-button"),
  fileInput: document.getElementById("file-input"),
  cameraButton: document.getElementById("camera-button"),
  cameraRow: document.getElementById("camera-row"),
  cameraPreview: document.getElementById("camera-preview"),
  cameraStopButton: document.getElementById("camera-stop-button"),
  attachmentRow: document.getElementById("attachment-row"),
  attachmentName: document.getElementById("attachment-name"),
  clearAttachment: document.getElementById("clear-attachment"),
  conversationSearch: document.getElementById("conversation-search"),
  newChatButton: document.getElementById("new-chat-button"),
  pinChatButton: document.getElementById("pin-chat-button"),
  shareChatButton: document.getElementById("share-chat-button"),
  exportChatButton: document.getElementById("export-chat-button"),
  postcardButton: document.getElementById("postcard-button"),
  deleteChatButton: document.getElementById("delete-chat-button"),
  premiumButton: document.getElementById("premium-button"),
  settingsButton: document.getElementById("settings-button"),
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
  toastTimerId: null,
  activeModal: null,
  cameraStream: null,
};

async function startCameraCheckIn() {
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

const QUICK_PROMPTS = [
  {
    title: "Plan my day",
    description: "Turn a messy list into a realistic schedule.",
    prompt: "Build me a realistic plan for today with priorities, time blocks, and breaks.",
  },
  {
    title: "Break down a feature",
    description: "Turn an idea into build-ready tasks.",
    prompt: "Help me break a feature idea into implementation tasks, edge cases, and a delivery order.",
  },
  {
    title: "Summarize priorities",
    description: "Reduce noise into a short action list.",
    prompt: "Summarize my priorities for this week in five concise bullets with the highest-leverage actions first.",
  },
  {
    title: "Calm check-in",
    description: "Reset stress into actionable next steps.",
    prompt: "Give me a calm mental reset and a practical next-step plan for when I feel overwhelmed.",
  },
];

initChrome();

function getDraftStorageKey() {
  return getConversationDraftKey(state.user);
}

function loadDrafts() {
  const raw = localStorage.getItem(getDraftStorageKey());
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(getDraftStorageKey());
    return {};
  }
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
  const draft = state.drafts[conversationId] || "";
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

  elements.sidebarUserName.textContent = userName;
  elements.sidebarUserEmail.textContent = userEmail;
  renderUserAvatar(elements.sidebarUserAvatar, state.user, userName);
  elements.sidebarPlanBadge.textContent = "Free Plan";
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

function renderCompanionGrid() {
  elements.companionGrid.innerHTML = COMPANION_PROFILES.map(
    (profile) => `
      <article class="companion-card panel glass">
        <div class="companion-card-head">
          <span class="feature-badge">${escapeHtml(profile.badge)}</span>
          <span class="companion-card-kicker">Focused mode</span>
        </div>
        <h3>${escapeHtml(profile.name)}</h3>
        <p>${escapeHtml(profile.description)}</p>
        <button class="button secondary compact btn-icon" type="button" data-start-companion="${profile.id}" aria-label="Open ${escapeHtml(profile.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Open mode
        </button>
      </article>
    `,
  ).join("");
}

function renderEmptyState(activeConversation) {
  const heading = activeConversation
    ? `Continue ${escapeHtml(activeConversation.title)}`
    : `How can I help, ${escapeHtml(displayNameForUser(state.user))}?`;
  const subtitle = activeConversation
    ? "Use a quick prompt below or write your own message to start this conversation."
    : "Start with a suggested prompt or open one of the focused companion modes to begin in the cleaner workspace.";

  return `
    <div class="empty-chat chatgpt-empty-state">
      <div class="empty-orb-mark">AI</div>
      <h3>${heading}</h3>
      <p>${subtitle}</p>
      <div class="suggestion-grid">
        ${QUICK_PROMPTS.map(
          (item, index) => `
            <button class="suggestion-card" type="button" data-quick-prompt="${index}">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.description)}</span>
            </button>
          `,
        ).join("")}
      </div>
      <div class="suggestion-companions">
        ${COMPANION_PROFILES.map(
          (profile) => `
            <button class="suggestion-chip" type="button" data-empty-companion="${profile.id}">
              <span>${escapeHtml(profile.name)}</span>
              <small>${escapeHtml(profile.badge)}</small>
            </button>
          `,
        ).join("")}
      </div>
    </div>
  `;
}

function renderChatHeader() {
  const activeConversation = getActiveConversation();

  if (!activeConversation) {
    elements.activeChatTitle.textContent = "New chat";
    elements.activeChatMeta.textContent = "Pick a prompt, launch a mode, or start typing below.";
    elements.pinChatButton.disabled = true;
    elements.pinChatButton.textContent = "Pin";
    elements.shareChatButton.disabled = true;
    elements.exportChatButton.disabled = true;
    elements.postcardButton.disabled = true;
    elements.deleteChatButton.disabled = true;
    elements.companionShelf.hidden = false;
    return;
  }

  elements.activeChatTitle.textContent = activeConversation.title;
  elements.activeChatMeta.textContent = `${activeConversation.characterName || "AI Companion"} • ${activeConversation.messages?.length || 0} messages`;
  elements.pinChatButton.disabled = false;
  const pinSvg = elements.pinChatButton.querySelector("svg")?.outerHTML || "";
  elements.pinChatButton.innerHTML = `${pinSvg} ${activeConversation.pinned ? "Unpin" : "Pin"}`;
  elements.shareChatButton.disabled = false;
  elements.exportChatButton.disabled = false;
  elements.postcardButton.disabled = false;
  elements.deleteChatButton.disabled = false;
  elements.companionShelf.hidden = Boolean(activeConversation.messages?.length);
}

function renderMessages() {
  const activeConversation = getActiveConversation();

  if (!activeConversation) {
    elements.chatMessages.classList.add("is-empty");
    elements.chatMessages.innerHTML = renderEmptyState(null);
    return;
  }

  if (!(activeConversation.messages || []).length) {
    elements.chatMessages.classList.add("is-empty");
    elements.chatMessages.innerHTML = renderEmptyState(activeConversation);
    return;
  }

  elements.chatMessages.classList.remove("is-empty");
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
            <p>${escapeHtml(message.content)}</p>
            ${message.attachmentName ? `<button class="attachment-chip" type="button" data-download-attachment="${escapeHtml(message.attachmentId || "")}" ${message.attachmentId ? "" : "disabled"}>${escapeHtml(message.attachmentName)}</button>` : ""}
          </div>
        </article>
      `,
    )
    .join("");

  const thinkingMarkup = state.isThinking
    ? `
      <article class="message-row assistant" data-avatar="${escapeHtml(assistantInitials)}">
        <div class="bubble assistant typing-bubble">
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
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
}

async function fetchConversations() {
  const params = new URLSearchParams({ limit: "50" });
  if (state.conversationSearch.trim()) {
    params.set("search", state.conversationSearch.trim());
  }
  state.conversations = await apiRequest(`/api/chat?${params.toString()}`, { auth: true });
  if (!state.activeConversationId && state.conversations.length > 0) {
    state.activeConversationId = getOrderedConversations()[0].id;
  } else if (state.activeConversationId && !state.conversations.some((item) => item.id === state.activeConversationId)) {
    state.activeConversationId = state.conversations[0]?.id || null;
  }
}

async function createConversation(payload = {}) {
  const conversation = await apiRequest("/api/chat/conversations", {
    method: "POST",
    auth: true,
    body: payload,
  });

  replaceConversation(conversation);
  state.activeConversationId = conversation.id;
  render();
  return conversation;
}

async function togglePin(conversationId) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    return;
  }

  const updated = await apiRequest(`/api/chat/conversations/${conversationId}`, {
    method: "PATCH",
    auth: true,
    body: {
      pinned: !conversation.pinned,
    },
  });
  replaceConversation(updated);
  render();
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
    state.drafts[state.activeConversationId] = value;
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

  state.drafts[conversation.id] = profile.kickoffPrompt;
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
  if (!conversation?.id) throw new Error("Choose a conversation first.");
  const response = await fetch(`/api/play/postcard/${encodeURIComponent(conversation.id)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!response.ok) throw new Error("A voice postcard is not available for this conversation.");
  const url = URL.createObjectURL(await response.blob());
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
  await audio.play();
  showToast("Playing your companion postcard.", "success");
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
  const snapshot = JSON.parse(JSON.stringify(activeConversation));
  const optimisticMessage = {
    id: `temp-${Date.now()}`,
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
  render();

  try {
    const attachment = await uploadSelectedAttachment(selectedFile);
    const response = await apiRequest("/api/chat", {
      method: "POST",
      auth: true,
      body: {
        conversationId: activeConversation.id,
        message: draft,
        attachmentName,
        attachmentId: attachment?.id || null,
        personaPrompt: activeConversation.personaPrompt || null,
        characterName: activeConversation.characterName || null,
        cameraOptIn: Boolean(cameraFrame),
        cameraFrame,
      },
    });

    replaceConversation(response.conversation);
    if (response.warning) {
      showToast(response.warning, "warning");
    }
  } catch (error) {
    replaceConversation(snapshot);
    state.drafts[activeConversation.id] = draft;
    saveDrafts();
    elements.messageInput.value = draft;
    resizeComposer();
    showToast(error.message || "Failed to get a response.", "error");
  } finally {
    state.isThinking = false;
    render();
  }
}

function bindStaticEvents() {
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

  elements.sendButton.addEventListener("click", () => handleSend());
  elements.cameraButton?.addEventListener("click", () => {
    if (state.cameraStream) stopCameraCheckIn();
    else startCameraCheckIn();
  });
  elements.cameraStopButton?.addEventListener("click", stopCameraCheckIn);
  window.addEventListener("pagehide", stopCameraCheckIn, { once: true });

  elements.chatMessages.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-download-attachment]");
    if (!button?.dataset.downloadAttachment) return;
    try {
      await downloadAttachment(button.dataset.downloadAttachment);
    } catch (error) {
      showToast(error.message || "Could not download this attachment.", "error");
    }
  });

  elements.fileInput.addEventListener("change", () => {
    state.selectedFile = elements.fileInput.files?.[0] || null;
    renderAttachment();
  });

  elements.clearAttachment.addEventListener("click", () => {
    state.selectedFile = null;
    elements.fileInput.value = "";
    renderAttachment();
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

  elements.premiumButton.addEventListener("click", () => {
    openModal("premium");
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
    showToast("Premium access request noted. Wire billing or upgrade handling next.", "info");
    closeModal("premium");
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

  elements.companionGrid.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-start-companion]");
    if (!button) {
      return;
    }
    await startCompanion(button.dataset.startCompanion);
  });

  elements.chatMessages.addEventListener("click", async (event) => {
    const quickPromptButton = event.target.closest("[data-quick-prompt]");
    if (quickPromptButton) {
      const prompt = QUICK_PROMPTS[Number(quickPromptButton.dataset.quickPrompt)]?.prompt;
      if (prompt) {
        await handleSend(prompt);
      }
      return;
    }

    const companionButton = event.target.closest("[data-empty-companion]");
    if (companionButton) {
      await startCompanion(companionButton.dataset.emptyCompanion);
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

  renderCompanionGrid();
  bindStaticEvents();

  await fetchConversations();
  render();
  await maybeConsumeStarterCharacter();

  if (!state.activeConversationId && state.conversations.length > 0) {
    state.activeConversationId = getOrderedConversations()[0].id;
  }

  elements.messageInput.value = state.activeConversationId ? state.drafts[state.activeConversationId] || "" : "";
  resizeComposer();
  render();
})();
