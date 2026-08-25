import { apiRequest, ensureSession, initChrome } from "./common.js";

const list = document.getElementById("notification-list");
const status = document.getElementById("notification-status");
const readAll = document.getElementById("notification-read-all");

function notificationCard(item) {
  const article = document.createElement("article");
  article.className = `notification-card${item.read ? " is-read" : ""}`;
  article.dataset.notificationId = item.id;
  const marker = document.createElement("span");
  marker.className = "notification-marker";
  marker.textContent = item.category === "security" ? "◇" : "◌";
  const copy = document.createElement("div");
  const category = document.createElement("small");
  category.textContent = item.category.replaceAll("_", " ").toUpperCase();
  const title = document.createElement("h2");
  title.textContent = item.title;
  const message = document.createElement("p");
  message.textContent = item.message;
  const time = document.createElement("time");
  time.dateTime = item.createdAt || "";
  time.textContent = item.createdAt ? new Date(item.createdAt).toLocaleString() : "";
  copy.append(category, title, message, time);
  const actions = document.createElement("div");
  if (item.actionPath?.startsWith("/") && !item.actionPath.startsWith("//")) {
    const open = document.createElement("a");
    open.href = item.actionPath;
    open.textContent = "Open";
    actions.append(open);
  }
  if (!item.read) {
    const read = document.createElement("button");
    read.type = "button";
    read.dataset.notificationRead = item.id;
    read.textContent = "Mark read";
    actions.append(read);
  }
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.dataset.notificationDismiss = item.id;
  dismiss.textContent = "Dismiss";
  actions.append(dismiss);
  article.append(marker, copy, actions);
  return article;
}

async function loadNotifications() {
  const response = await apiRequest("/api/workspace/notifications", { auth: true });
  list.replaceChildren(...response.notifications.map(notificationCard));
  if (!response.notifications.length) {
    const empty = document.createElement("p");
    empty.className = "notification-empty";
    empty.textContent = "You are all caught up.";
    list.append(empty);
  }
  status.textContent = response.unreadCount ? `${response.unreadCount} unread notification${response.unreadCount === 1 ? "" : "s"}` : "No unread notifications";
  readAll.disabled = response.unreadCount === 0;
}

list?.addEventListener("click", async (event) => {
  const read = event.target.closest("[data-notification-read]");
  const dismiss = event.target.closest("[data-notification-dismiss]");
  try {
    if (read) await apiRequest(`/api/workspace/notifications/${read.dataset.notificationRead}/read`, { method: "PATCH", auth: true });
    if (dismiss) await apiRequest(`/api/workspace/notifications/${dismiss.dataset.notificationDismiss}`, { method: "DELETE", auth: true });
    if (read || dismiss) await loadNotifications();
  } catch (error) {
    status.textContent = error.message || "The notification could not be updated.";
  }
});

readAll?.addEventListener("click", async () => {
  try {
    await apiRequest("/api/workspace/notifications/read-all", { method: "POST", auth: true });
    await loadNotifications();
  } catch (error) {
    status.textContent = error.message || "Notifications could not be updated.";
  }
});

initChrome();
(async () => { const session = await ensureSession({ redirectTo: "/login" }); if (session?.verified) await loadNotifications(); })();
