import { apiRequest, ensureSession, initChrome, refreshNotificationBadge } from "./common.js";

const list = document.getElementById("notification-list");
const status = document.getElementById("notification-status");
const readAll = document.getElementById("notification-read-all");
const filters = document.getElementById("notification-filters");
const unreadTotal = document.getElementById("notification-unread-total");
const todayTotal = document.getElementById("notification-today-total");
const celebration = document.getElementById("notification-celebration");
const liveNote = document.getElementById("notification-live-note");
const liveCategory = document.getElementById("notification-live-category");
const liveTitle = document.getElementById("notification-live-title");
const liveMessage = document.getElementById("notification-live-message");
const liveAction = document.getElementById("notification-live-action");
const liveNext = document.getElementById("notification-live-next");
const liveProgress = document.getElementById("notification-live-progress");
const mutedControls = document.getElementById("notification-muted-controls");

const state = { notifications: [], filter: "all", liveIndex: 0, liveTimer: null };
const categoryDetails = {
  check_in: { icon: "◌", label: "FROM EMORA", tone: "emora" },
  reflection: { icon: "☼", label: "LOOK BACK", tone: "emora" },
  session: { icon: "✦", label: "YOUR SESSION", tone: "emora" },
  memory: { icon: "◇", label: "MEMORY REVIEW", tone: "memory" },
  progress: { icon: "↗", label: "GENTLE PROGRESS", tone: "progress" },
  celebration: { icon: "✦", label: "WORTH CELEBRATING", tone: "celebration" },
  security: { icon: "⌾", label: "ACCOUNT SECURITY", tone: "security" },
  update: { icon: "·", label: "EMORA UPDATE", tone: "update" },
};
const categoryReasons = {
  check_in: "Shown because you explicitly enabled a check-in schedule.", reflection: "Shown when your real saved activity makes a requested reflection available.",
  session: "Shown for a session you started or scheduled.", memory: "Shown when a saved memory needs your review.", progress: "Shown after a stored goal or step changes.",
  celebration: "Shown after a completion confirmed by the server.", security: "Shown for account or sign-in safety and cannot be muted.", update: "Shown for a product or service change relevant to your account.",
};

function categoryFor(item) {
  return categoryDetails[item.category] || categoryDetails.update;
}

function relativeTime(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "Recently";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [["day", 86400], ["hour", 3600], ["minute", 60]];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === "minute") return formatter.format(Math.round(seconds / size), unit);
  }
  return "Just now";
}

function isToday(value) {
  const date = new Date(value || 0);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function matchesFilter(item) {
  if (state.filter === "all") return true;
  if (state.filter === "unread") return !item.read;
  if (state.filter === "emora") return ["check_in", "reflection", "session", "memory"].includes(item.category);
  if (state.filter === "progress") return ["progress", "celebration"].includes(item.category);
  return item.category === state.filter;
}

function notificationCard(item, index) {
  const detail = categoryFor(item);
  const article = document.createElement("article");
  article.className = `notification-card tone-${detail.tone}${item.read ? " is-read" : " is-unread"}${item.importance === "high" ? " is-important" : ""}${item.celebration ? " is-celebration" : ""}`;
  article.dataset.notificationId = item.id;
  article.dataset.importance = item.category === "security" ? "security" : item.importance || "normal";
  article.style.setProperty("--notification-index", index);

  const marker = document.createElement("span");
  marker.className = "notification-marker";
  if (["emora", "memory", "progress", "celebration"].includes(detail.tone)) {
    const logo = document.createElement("img");
    logo.src = "/static/images/emora-logo-v2-64.png?v=20260828-orbit";
    logo.alt = "";
    marker.append(logo);
  } else {
    marker.textContent = detail.icon;
  }
  const copy = document.createElement("div");
  copy.className = "notification-copy";
  const meta = document.createElement("div");
  meta.className = "notification-meta";
  const category = document.createElement("small");
  category.textContent = detail.label;
  const time = document.createElement("time");
  time.dateTime = item.createdAt || "";
  time.textContent = relativeTime(item.createdAt);
  time.title = item.createdAt ? new Date(item.createdAt).toLocaleString() : "";
  meta.append(category, time);
  const title = document.createElement("h2");
  title.textContent = item.title;
  const message = document.createElement("p");
  message.textContent = item.message;
  copy.append(meta, title, message);
  const why = document.createElement("details");
  why.className = "notification-why";
  const whySummary = document.createElement("summary");
  whySummary.textContent = "Why am I seeing this?";
  const whyCopy = document.createElement("p");
  whyCopy.textContent = categoryReasons[item.category] || "Shown because this account has relevant stored activity.";
  why.append(whySummary, whyCopy);
  copy.append(why);

  const actions = document.createElement("div");
  actions.className = "notification-actions";
  if (item.actionPath?.startsWith("/") && !item.actionPath.startsWith("//")) {
    const open = document.createElement("a");
    open.href = item.actionPath;
    open.dataset.notificationOpen = item.id;
    open.textContent = item.actionLabel || "Open";
    actions.append(open);
  }
  if (!item.read && item.category === "security") {
    const read = document.createElement("button");
    read.type = "button";
    read.dataset.notificationRead = item.id;
    read.textContent = "Done";
    actions.append(read);
  }
  if (!item.read && item.category !== "security") {
    const helpful = document.createElement("button");
    helpful.type = "button";
    helpful.className = "notification-response notification-helpful";
    helpful.dataset.notificationResponse = item.id;
    helpful.dataset.response = "helpful";
    helpful.textContent = "This helped ✦";
    const later = document.createElement("button");
    later.type = "button";
    later.className = "notification-response notification-later";
    later.dataset.notificationResponse = item.id;
    later.dataset.response = "later";
    later.textContent = "Tomorrow";
    actions.append(helpful, later);
  }
  if (item.category !== "security") {
    const mute = document.createElement("button");
    mute.type = "button";
    mute.dataset.notificationMute = item.category;
    mute.textContent = `Mute ${detail.label.toLowerCase()}`;
    actions.append(mute);
  }
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "notification-dismiss";
  dismiss.dataset.notificationDismiss = item.id;
  dismiss.setAttribute("aria-label", `Dismiss ${item.title}`);
  dismiss.textContent = "×";
  actions.append(dismiss);
  article.append(marker, copy, actions);
  return article;
}

function emptyState() {
  const empty = document.createElement("div");
  empty.className = "notification-empty";
  const image = document.createElement("img");
  image.src = "/static/images/emora-logo-v2-192.png?v=20260828-orbit";
  image.alt = "";
  const heading = document.createElement("h2");
  heading.textContent = state.filter === "all" ? "You’re beautifully up to date." : "Nothing here right now.";
  const copy = document.createElement("p");
  copy.textContent = "When something useful deserves your attention, Emora will keep it here—quietly and clearly.";
  empty.append(image, heading, copy);
  return empty;
}

function groupSection(label, items, startIndex) {
  const section = document.createElement("section");
  section.className = "notification-group";
  const heading = document.createElement("h2");
  heading.textContent = label;
  const cards = document.createElement("div");
  cards.append(...items.map((item, index) => notificationCard(item, startIndex + index)));
  section.append(heading, cards);
  return section;
}

function renderNotifications() {
  const visible = state.notifications.filter(matchesFilter);
  list.replaceChildren();
  if (!visible.length) {
    list.append(emptyState());
    return;
  }
  const today = visible.filter((item) => isToday(item.createdAt));
  const earlier = visible.filter((item) => !isToday(item.createdAt));
  if (today.length) list.append(groupSection("TODAY", today, 0));
  if (earlier.length) list.append(groupSection("EARLIER", earlier, today.length));
}

function liveItems() {
  const unread = state.notifications.filter((item) => !item.read);
  return unread.length ? unread : state.notifications.slice(0, 5);
}

function renderLiveNote({ animate = true } = {}) {
  const items = liveItems();
  if (!items.length) {
    liveCategory.textContent = "ALL CAUGHT UP";
    liveTitle.textContent = "Nothing is asking for you.";
    liveMessage.textContent = "Stay as long as you like—or close this page knowing everything important has been seen.";
    liveAction.hidden = true;
    liveNext.hidden = true;
    liveProgress.replaceChildren();
    return;
  }
  state.liveIndex %= items.length;
  const item = items[state.liveIndex];
  const detail = categoryFor(item);
  if (animate) liveNote.classList.add("is-switching");
  window.setTimeout(() => {
    liveCategory.textContent = detail.label;
    liveTitle.textContent = item.title;
    liveMessage.textContent = item.message;
    if (item.actionPath?.startsWith("/") && !item.actionPath.startsWith("//")) {
      liveAction.href = item.actionPath;
      liveAction.textContent = item.actionLabel || "Open";
      liveAction.dataset.notificationId = item.id;
      liveAction.hidden = false;
    } else {
      liveAction.hidden = true;
      delete liveAction.dataset.notificationId;
    }
    liveNext.hidden = items.length < 2;
    liveProgress.replaceChildren(...items.map((_, index) => {
      const dot = document.createElement("i");
      dot.className = index === state.liveIndex ? "active" : "";
      return dot;
    }));
    liveNote.classList.remove("is-switching");
  }, animate ? 170 : 0);
}

function restartLiveRotation() {
  window.clearInterval(state.liveTimer);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || liveItems().length < 2) return;
  state.liveTimer = window.setInterval(() => {
    state.liveIndex = (state.liveIndex + 1) % liveItems().length;
    renderLiveNote();
  }, 6500);
}

function burst() {
  if (!celebration || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  celebration.classList.remove("is-active");
  requestAnimationFrame(() => celebration.classList.add("is-active"));
}

async function loadNotifications() {
  const response = await apiRequest("/api/workspace/notifications?limit=100", { auth: true, cache: "no-store" });
  state.notifications = response.notifications || [];
  const muted = response.mutedCategories || [];
  if (mutedControls) {
    mutedControls.hidden = muted.length === 0;
    mutedControls.replaceChildren();
    if (muted.length) {
      const label = document.createElement("span");
      label.textContent = "Muted categories:";
      mutedControls.append(label, ...muted.map((category) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.notificationUnmute = category;
        button.textContent = `${category.replaceAll("_", " ")} · unmute`;
        return button;
      }));
    }
  }
  state.liveIndex = Math.min(state.liveIndex, Math.max(0, state.notifications.length - 1));
  renderNotifications();
  renderLiveNote({ animate: false });
  restartLiveRotation();
  const unread = Number(response.unreadCount || 0);
  const today = state.notifications.filter((item) => isToday(item.createdAt)).length;
  unreadTotal.textContent = String(unread);
  todayTotal.textContent = String(today);
  status.textContent = unread ? `${unread} gentle nudge${unread === 1 ? "" : "s"} waiting for you` : "Everything important has been seen";
  readAll.disabled = unread === 0;
  await refreshNotificationBadge();
}

filters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-notification-filter]");
  if (!button) return;
  state.filter = button.dataset.notificationFilter;
  filters.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  renderNotifications();
});

mutedControls?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-notification-unmute]");
  if (!button) return;
  try {
    await apiRequest(`/api/workspace/notifications/categories/${encodeURIComponent(button.dataset.notificationUnmute)}/mute`, { method: "PUT", body: { muted: false }, auth: true });
    status.textContent = `${button.dataset.notificationUnmute.replaceAll("_", " ")} notifications are enabled.`;
    await loadNotifications();
  } catch (error) { status.textContent = error.message || "That notification category could not be enabled."; }
});

list?.addEventListener("click", async (event) => {
  const read = event.target.closest("[data-notification-read]");
  const dismiss = event.target.closest("[data-notification-dismiss]");
  const open = event.target.closest("[data-notification-open]");
  const responseButton = event.target.closest("[data-notification-response]");
  const muteButton = event.target.closest("[data-notification-mute]");
  try {
    if (muteButton) {
      const category = muteButton.dataset.notificationMute;
      if (!window.confirm(`Mute future ${category.replaceAll("_", " ")} notifications? You can re-enable the category through this API or account support.`)) return;
      await apiRequest(`/api/workspace/notifications/categories/${encodeURIComponent(category)}/mute`, { method: "PUT", body: { muted: true }, auth: true });
      status.textContent = `${category.replaceAll("_", " ")} notifications are muted.`;
      await loadNotifications();
      return;
    }
    if (open) {
      event.preventDefault();
      await apiRequest(`/api/workspace/notifications/${open.dataset.notificationOpen}/read`, { method: "PATCH", auth: true });
      window.location.assign(open.href);
      return;
    }
    if (read) {
      const item = state.notifications.find((entry) => entry.id === read.dataset.notificationRead);
      await apiRequest(`/api/workspace/notifications/${read.dataset.notificationRead}/read`, { method: "PATCH", auth: true });
      if (item?.celebration) burst();
    }
    if (responseButton) {
      const response = responseButton.dataset.response;
      const item = state.notifications.find((entry) => entry.id === responseButton.dataset.notificationResponse);
      responseButton.closest(".notification-card")?.classList.add(response === "helpful" ? "is-acknowledged" : "is-snoozing");
      await apiRequest(`/api/workspace/notifications/${responseButton.dataset.notificationResponse}/respond`, { method: "PATCH", body: { response }, auth: true });
      status.textContent = response === "later" ? "I’ll bring that note back tomorrow." : "I’m glad that found you at the right time.";
      if (response === "helpful" || item?.celebration) burst();
    }
    if (dismiss) await apiRequest(`/api/workspace/notifications/${dismiss.dataset.notificationDismiss}`, { method: "DELETE", auth: true });
    if (read || dismiss || responseButton) {
      window.setTimeout(() => loadNotifications().catch(() => {
        status.textContent = "The inbox changed, but I could not refresh it just yet.";
      }), 650);
    }
  } catch (error) {
    status.textContent = error.message || "That update did not stick. Please try once more.";
  }
});

liveNext?.addEventListener("click", () => {
  state.liveIndex = (state.liveIndex + 1) % Math.max(1, liveItems().length);
  renderLiveNote();
  restartLiveRotation();
});

liveAction?.addEventListener("click", async (event) => {
  const id = liveAction.dataset.notificationId;
  if (!id) return;
  event.preventDefault();
  try {
    await apiRequest(`/api/workspace/notifications/${id}/read`, { method: "PATCH", auth: true });
  } catch { /* the destination is still safe to open */ }
  window.location.assign(liveAction.href);
});

liveNote?.addEventListener("pointerenter", () => window.clearInterval(state.liveTimer));
liveNote?.addEventListener("pointerleave", restartLiveRotation);

readAll?.addEventListener("click", async () => {
  try {
    await apiRequest("/api/workspace/notifications/read-all", { method: "POST", auth: true });
    burst();
    await loadNotifications();
  } catch (error) {
    status.textContent = error.message || "Notifications could not be updated.";
  }
});

initChrome();
(async () => {
  const session = await ensureSession({ redirectTo: "/login" });
  if (!session?.verified) return;
  try { await loadNotifications(); }
  catch (error) { status.textContent = error.message || "Emora could not gather your notifications just yet."; }
})();
