export const STORAGE_KEYS = {
  token: "token",
  user: "user",
  theme: "theme",
  starterCharacter: "ai-companion:starter-character",
};

const EMORA_PRESENCE_KEY = "emora:live-presence";
const EMORA_LIVE_STATES = new Set(["LIVE", "LISTENING", "THINKING", "SPEAKING", "WITH YOU", "OFFLINE"]);
let navigationStateStarted = false;
let lastPublishedPresence = "";
let presenceChannel = null;

function renderEmoraPresenceState(state) {
  const normalized = EMORA_LIVE_STATES.has(state) ? state : "OFFLINE";
  document.querySelectorAll("[data-emora-live-state]").forEach((element) => {
    element.textContent = normalized;
    element.dataset.state = normalized.toLowerCase().replaceAll(" ", "-");
    element.hidden = false;
  });
}

export function publishEmoraPresence(state) {
  if (!EMORA_LIVE_STATES.has(state) || state === lastPublishedPresence) return;
  lastPublishedPresence = state;
  const payload = { state, at: Date.now() };
  try { localStorage.setItem(EMORA_PRESENCE_KEY, JSON.stringify(payload)); } catch (_) { /* private storage may be unavailable */ }
  presenceChannel?.postMessage?.(payload);
  renderEmoraPresenceState(state);
}

function renderPlayNavigationProgress(progress = {}) {
  document.querySelectorAll("[data-play-progress]").forEach((element) => {
    const milestone = progress.indicator === "milestone";
    const ready = Number(progress.ready || 0);
    element.textContent = milestone ? "✦" : ready ? String(ready) : "";
    element.hidden = !milestone && !ready;
    element.dataset.kind = milestone ? "milestone" : "ready";
    element.setAttribute("aria-label", milestone ? "A real Emora Play milestone was reached" : `${ready} Emora Play experience${ready === 1 ? "" : "s"} ready`);
  });
}

function initDynamicNavigation() {
  if (navigationStateStarted || !getToken()) return;
  navigationStateStarted = true;
  try {
    const saved = JSON.parse(localStorage.getItem(EMORA_PRESENCE_KEY) || "null");
    if (saved?.state && Date.now() - Number(saved.at || 0) < 15000) renderEmoraPresenceState(saved.state);
  } catch (_) { /* use live health result below */ }
  if ("BroadcastChannel" in window) {
    presenceChannel = new BroadcastChannel("emora-presence");
    presenceChannel.addEventListener("message", (event) => {
      if (event.data?.state) renderEmoraPresenceState(event.data.state);
    });
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== EMORA_PRESENCE_KEY || !event.newValue) return;
    try { renderEmoraPresenceState(JSON.parse(event.newValue).state); } catch (_) { /* ignore malformed local state */ }
  });
  fetch("/health", { cache: "no-store" })
    .then((response) => {
      try {
        const current = JSON.parse(localStorage.getItem(EMORA_PRESENCE_KEY) || "null");
        if (current?.state && Date.now() - Number(current.at || 0) < 15000 && current.state !== "LIVE") {
          renderEmoraPresenceState(current.state);
          return;
        }
      } catch (_) { /* fall through to service health */ }
      renderEmoraPresenceState(response.ok ? "LIVE" : "OFFLINE");
    })
    .catch(() => renderEmoraPresenceState("OFFLINE"));
  apiRequest("/api/play/progress", { auth: true, cache: "no-store" })
    .then(renderPlayNavigationProgress)
    .catch(() => renderPlayNavigationProgress({}));
}

export const COMPANION_PROFILES = [
  {
    id: "grok-companion",
    name: "Grok's Companion",
    badge: "Candid + Sharp",
    description: "Direct strategy partner for bold decisions, deep thinking, and fast iteration.",
    kickoffPrompt: "Give me the brutally honest next move on my current project.",
    personaPrompt:
      "You are Grok's Companion inside AI Companion. Be direct, witty when useful, and practical. Prioritize clarity and truthful reasoning over politeness fluff. Keep answers actionable and easy to execute.",
    greeting:
      "I am Grok's Companion. Bring me your idea, problem, or plan, and I will give you a direct, high-signal path forward.",
  },
  {
    id: "focus-coach",
    name: "Focus Coach",
    badge: "Calm + Structured",
    description: "Turns mental clutter into a clear plan with short steps and realistic pacing.",
    kickoffPrompt: "Build me a no-overwhelm plan for today with breaks included.",
    personaPrompt:
      "You are Focus Coach inside AI Companion. Keep tone calm, organized, and encouraging. Break requests into concrete steps with priorities, time blocks, and realistic effort.",
    greeting:
      "I am your Focus Coach. Tell me what is pulling your attention, and I will build a calm plan you can start immediately.",
  },
  {
    id: "builder-buddy",
    name: "Builder Buddy",
    badge: "Product + Execution",
    description: "Helps you ship features with concise technical direction and implementation steps.",
    kickoffPrompt: "Help me turn this feature idea into a build-ready task list.",
    personaPrompt:
      "You are Builder Buddy inside AI Companion. Focus on implementation details, edge cases, and concise technical execution plans. Prefer checklists, code-level suggestions, and concrete next steps.",
    greeting:
      "Builder Buddy online. Share your feature goal and stack, and I will break it into build-ready tasks.",
  },
];

const ENTITLEMENT_EXPLANATIONS = {
  voice: { plan: "Plus", title: "Talk when typing is not enough", copy: "Plus adds voice conversations while keeping your saved space and privacy controls unchanged." },
  companion_memory: { plan: "Plus", title: "Let Emora hold the context you choose", copy: "Plus expands continuity across conversations. You can inspect, edit, pause, or forget every saved detail." },
  extended_chat: { plan: "Plus", title: "Bring more context into the conversation", copy: "Plus supports longer messages and private file context for conversations that need more room." },
  conversation_export: { plan: "Plus", title: "Keep a copy of meaningful conversations", copy: "Plus lets you export a conversation as text or JSON without changing the original." },
  look_back: { plan: "Plus", title: "Return to moments worth revisiting", copy: "Plus uses your real conversation history to surface gentle Look Back reflections." },
  personalization: { plan: "Plus", title: "Choose how Emora meets you", copy: "Plus adds explicit response-style controls. Emora follows what you choose and never guesses sensitive traits." },
  weekly_story: { plan: "Plus", title: "See your real week take shape", copy: "Plus turns your actual conversations, goals, moments, and journals into a private weekly reflection." },
  conversation_remix: { plan: "Pro", title: "Turn a conversation into something useful", copy: "Pro can transform an existing conversation into a real journal draft, plan, or other supported format." },
  ambient_rooms: { plan: "Pro", title: "Shape a calmer conversation space", copy: "Pro saves ambient room choices to your account for a more immersive Companion experience." },
  focus_rooms: { plan: "Pro", title: "Hold a quiet focus room together", copy: "Pro adds private invite-only focus rooms with a chosen duration and no public feed." },
  advanced_insights: { plan: "Pro", title: "See the bigger picture", copy: "Pro adds deeper patterns built only from your actual activity, check-ins, goals, and conversations." },
  adaptive_companion: { plan: "Pro", title: "Let Emora understand the bigger picture", copy: "With your permission, Pro can use active goals and your latest check-in when they are relevant. Journal entries remain private." },
  personal_constellation: { plan: "Pro", title: "Explore what is beginning to connect", copy: "Pro opens the full Personal Constellation built only from goals, memories, and moments you created." },
  voice_postcards: { plan: "Complete", title: "Keep a conversation in voice", copy: "Complete can create a private voice postcard from a conversation you choose." },
};

function showUpgradeExplanation(entitlement) {
  const dialog = document.getElementById("upgrade-dialog");
  if (!dialog) return false;
  const detail = ENTITLEMENT_EXPLANATIONS[entitlement] || {
    plan: "a higher plan",
    title: "Unlock more with Emora",
    copy: "See which Emora plan includes this capability and what changes when you upgrade.",
  };
  const plan = document.getElementById("upgrade-dialog-plan");
  const title = document.getElementById("upgrade-dialog-title");
  const copy = document.getElementById("upgrade-dialog-copy");
  const link = document.getElementById("upgrade-dialog-link");
  if (plan) plan.textContent = `INCLUDED WITH ${detail.plan.toUpperCase()}`;
  if (title) title.textContent = detail.title;
  if (copy) copy.textContent = detail.copy;
  if (link) {
    link.textContent = `View ${detail.plan}`;
    link.href = `/payment?feature=${encodeURIComponent(entitlement)}`;
  }
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  return true;
}

let systemThemeListenerBound = false;

function resolveTheme(theme = getStoredTheme()) {
  return theme === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : theme;
}

export function getToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || "";
}

export function getStoredUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEYS.user);
    return null;
  }
}

export function setStoredUser(user) {
  if (!user) {
    localStorage.removeItem(STORAGE_KEYS.user);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

export function storeSession(payload) {
  if (payload?.token) {
    localStorage.setItem(STORAGE_KEYS.token, payload.token);
  }
  if (payload?.user) {
    setStoredUser(payload.user);
  }
  syncChrome();
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.user);
  syncChrome();
}

export function displayNameForUser(user) {
  if (!user) {
    return "Friend";
  }

  if (user.name) {
    return user.name;
  }

  if (user.email) {
    return user.email.split("@")[0];
  }

  return "Friend";
}

export function getInitials(value) {
  const normalized = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return normalized || "AI";
}

export function getUserAvatarUrl(user) {
  return user?.avatarUrl || "";
}

export function renderUserAvatar(element, user, fallbackLabel = null) {
  if (!element) {
    return;
  }

  const label = fallbackLabel || displayNameForUser(user);
  const avatarUrl = getUserAvatarUrl(user);
  element.textContent = "";
  element.dataset.hasAvatar = avatarUrl ? "true" : "false";

  if (avatarUrl) {
    const image = document.createElement("img");
    image.src = avatarUrl;
    image.alt = `${label} avatar`;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      element.dataset.hasAvatar = "false";
      element.textContent = getInitials(label);
    });
    element.appendChild(image);
    return;
  }

  element.textContent = getInitials(label);
}

export function accessDisplayForUser(user = getStoredUser()) {
  const access = user?.access || {};
  if (access.isAdmin || access.plan === "admin") {
    return {
      kicker: "PLATFORM ADMIN",
      label: "Full platform access",
      compact: "Admin · Full access",
      planName: "Administrator",
    };
  }
  const planName = access.planName || "Free";
  const paid = Boolean(user && access.plan && access.plan !== "free");
  return {
    kicker: paid ? "YOUR EMORA SPACE" : "EMORA PLANS",
    label: user ? (paid ? `${planName} access` : "View plans") : "View access",
    compact: `${planName} plan`,
    planName,
  };
}

export function redirect(path) {
  window.location.assign(path);
}

export function getStoredTheme() {
  return localStorage.getItem(STORAGE_KEYS.theme) || "system";
}

export function applyTheme(theme = getStoredTheme()) {
  const root = document.documentElement;
  const resolvedTheme = resolveTheme(theme);

  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
  root.dataset.themePreference = theme;
  root.dataset.themeResolved = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
  localStorage.setItem(STORAGE_KEYS.theme, theme);
  updateThemeButtons();

  if (!systemThemeListenerBound) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", () => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
      }
    });
    systemThemeListenerBound = true;
  }
}

export function toggleTheme() {
  const root = document.documentElement;
  const nextTheme = root.classList.contains("dark") ? "light" : "dark";
  applyTheme(nextTheme);
}

function updateThemeButtons() {
  const root = document.documentElement;
  const nextModeLabel = root.classList.contains("dark") ? "Light mode" : "Dark mode";
  const ariaLabel = root.classList.contains("dark") ? "Switch to light mode" : "Switch to dark mode";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const textSpan = button.querySelector("span");
    if (textSpan) {
      textSpan.textContent = nextModeLabel;
    } else {
      button.textContent = nextModeLabel;
    }
    button.setAttribute("aria-label", ariaLabel);
    button.dataset.themeState = root.classList.contains("dark") ? "dark" : "light";
  });
}

export function syncChrome() {
  const user = getStoredUser();
  const name = displayNameForUser(user);

  document.querySelectorAll("[data-guest-nav]").forEach((element) => {
    element.hidden = Boolean(user);
  });

  document.querySelectorAll("[data-auth-nav]").forEach((element) => {
    element.hidden = !user;
  });

  document.querySelectorAll("[data-logout]").forEach((element) => {
    element.hidden = !user;
  });

  document.querySelectorAll("[data-user-pill]").forEach((element) => {
    element.hidden = !user;
    element.textContent = user ? name : "";
  });

  const access = user?.access || { plan: "free", planName: "Free", entitlements: [] };
  const plan = access.isAdmin ? "admin" : access.plan || "free";
  const isPaid = Boolean(user && plan !== "free");
  const accessDisplay = accessDisplayForUser(user);
  document.body.dataset.accessPlan = plan;
  document.body.dataset.accessPaid = String(isPaid);
  document.querySelectorAll("[data-sidebar-plan-access]").forEach((element) => {
    element.setAttribute("aria-label", access.isAdmin ? "Open administrator access controls" : isPaid ? `Manage ${access.planName} access` : "View Emora Pro plans");
    if (access.isAdmin) element.href = "/payment#billing-admin";
  });
  document.querySelectorAll("[data-sidebar-plan-kicker]").forEach((element) => {
    element.textContent = access.isAdmin ? "PLATFORM ADMIN" : isPaid ? `${accessDisplay.planName.toUpperCase()} SPACE` : "EMORA PRO";
  });
  document.querySelectorAll("[data-sidebar-plan-label]").forEach((element) => {
    element.textContent = access.isAdmin ? "Full platform access" : isPaid ? `${accessDisplay.planName} access` : "Unlock deeper insights";
  });
  document.querySelectorAll("[data-sidebar-plan-note]").forEach((element) => {
    element.textContent = access.isAdmin || access.entitlements?.includes("advanced_insights")
      ? "Your behavior summary is active."
      : "Behavior summaries and deeper patterns.";
  });
  document.querySelectorAll("[data-entitlement]").forEach((element) => {
    const allowed = Boolean(access.isAdmin || access.entitlements?.includes(element.dataset.entitlement));
    element.dataset.locked = String(!allowed);
    element.setAttribute("aria-disabled", String(!allowed));
    if (!allowed) element.title = `${element.dataset.planLabel || "A higher Emora plan"} is required`;
    if (element.dataset.entitlementBound !== "true") {
      element.dataset.entitlementBound = "true";
      const guard = (event) => {
        if (element.dataset.locked !== "true") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!showUpgradeExplanation(element.dataset.entitlement)) {
          window.location.assign(`/payment?feature=${encodeURIComponent(element.dataset.entitlement)}`);
        }
      };
      element.addEventListener("click", guard, true);
      element.addEventListener("submit", guard, true);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") guard(event);
      }, true);
    }
  });
}

export function hasStoredEntitlement(entitlement) {
  const access = getStoredUser()?.access;
  return Boolean(access?.isAdmin || access?.entitlements?.includes(entitlement));
}

export function guardEntitlement(entitlement) {
  if (hasStoredEntitlement(entitlement)) return true;
  if (!showUpgradeExplanation(entitlement)) {
    window.location.assign(`/payment?feature=${encodeURIComponent(entitlement)}`);
  }
  return false;
}

export function initChrome() {
  applyTheme();
  syncChrome();
  initDynamicNavigation();

  const upgradeDialog = document.getElementById("upgrade-dialog");
  if (upgradeDialog && upgradeDialog.dataset.bound !== "true") {
    upgradeDialog.dataset.bound = "true";
    upgradeDialog.addEventListener("click", (event) => {
      if (event.target === upgradeDialog) upgradeDialog.close?.();
    });
  }

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    if (button.dataset.themeBound === "true") {
      return;
    }
    button.dataset.themeBound = "true";
    button.addEventListener("click", () => toggleTheme());
  });

  document.querySelectorAll("[data-logout]").forEach((button) => {
    if (button.dataset.logoutBound === "true") {
      return;
    }
    button.dataset.logoutBound = "true";
    button.addEventListener("click", async () => {
      try {
        await apiRequest("/api/auth/logout", { method: "POST", auth: true });
      } catch {
        // Local session cleanup should still happen if the server token is already invalid.
      }
      clearSession();
      redirect("/login");
    });
  });
}

function normalizeErrorMessage(data) {
  if (!data || typeof data !== "object") {
    return "";
  }

  const value = data.message || data.detail || data.error || "";
  return typeof value === "object" ? value.message || "Request could not be completed." : value;
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", body, auth = false, headers = {}, signal, cache = "default" } = options;
  const requestHeaders = { ...headers };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (auth && getToken()) {
    requestHeaders.Authorization = `Bearer ${getToken()}`;
  }

  const response = await fetch(path, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    cache,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(normalizeErrorMessage(data) || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function ensureSession({ redirectTo = "/login" } = {}) {
  const token = getToken();
  if (!token) {
    if (redirectTo) {
      redirect(redirectTo);
    }
    return null;
  }

  try {
    const response = await apiRequest("/api/auth/verify", { auth: true });
    setStoredUser(response.user);
    syncChrome();
    return response;
  } catch {
    clearSession();
    if (redirectTo) {
      redirect(redirectTo);
    }
    return null;
  }
}

export function showStatus(element, message, tone = "error") {
  if (!element) {
    return;
  }

  if (!message) {
    element.hidden = true;
    element.textContent = "";
    element.dataset.tone = "";
    return;
  }

  element.hidden = false;
  element.textContent = message;
  element.dataset.tone = tone;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatSidebarTime(isoTime) {
  const messageTime = new Date(isoTime);
  const now = new Date();

  if (messageTime.toDateString() === now.toDateString()) {
    return messageTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (messageTime.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return messageTime.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatMessageTime(isoTime) {
  return new Date(isoTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function createChatTitle(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "New conversation";
  }
  return cleaned.length > 52 ? `${cleaned.slice(0, 52)}...` : cleaned;
}

export function buildShareText(conversation, displayName) {
  if (!conversation) {
    return "";
  }

  const assistantLabel = conversation.characterName || "AI Companion";
  const transcript = (conversation.messages || [])
    .map((message) => {
      const speaker = message.role === "assistant" ? assistantLabel : displayName;
      const attachment = message.attachmentName ? ` (Attachment: ${message.attachmentName})` : "";
      return `${speaker}: ${message.content}${attachment}`;
    })
    .join("\n\n");

  return `${assistantLabel} conversation: ${conversation.title}\n\n${transcript}`.trim();
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const success = document.execCommand("copy");
  textarea.remove();
  return success;
}

export function openExternal(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function getConversationDraftKey(user) {
  const userKey = user?._id || user?.id || user?.email || "guest";
  return `ai-companion:dashboard-drafts:${String(userKey).toLowerCase()}`;
}
