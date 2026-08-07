export const STORAGE_KEYS = {
  token: "token",
  user: "user",
  theme: "theme",
  starterCharacter: "ai-companion:starter-character",
};

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
}

export function initChrome() {
  applyTheme();
  syncChrome();

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

  return data.message || data.detail || data.error || "";
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", body, auth = false, headers = {} } = options;
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
