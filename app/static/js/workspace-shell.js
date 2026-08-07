import {
  STORAGE_KEYS,
  ensureSession,
  getStoredUser,
  displayNameForUser,
  getInitials,
  initChrome,
  redirect,
  renderUserAvatar,
} from "./common.js";

function getGreeting(name) {
  const hour = new Date().getHours();
  const prefix = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${prefix}, ${name}`;
}

function fillUserChrome() {
  const user = getStoredUser();
  const name = displayNameForUser(user);
  const email = user?.email || "Signed in workspace";
  const initials = getInitials(name);

  document.querySelectorAll("[data-session-user-name]").forEach((element) => {
    element.textContent = name;
  });

  document.querySelectorAll("[data-session-user-email]").forEach((element) => {
    element.textContent = email;
  });

  document.querySelectorAll("[data-session-user-initial]").forEach((element) => {
    element.textContent = initials;
  });

  document.querySelectorAll("[data-session-greeting]").forEach((element) => {
    element.textContent = getGreeting(name);
  });

  document.querySelectorAll("[data-session-avatar]").forEach((element) => {
    renderUserAvatar(element, user, name);
  });
}

function renderInsights(data) {
  const timeline = document.getElementById("timeline-chart");
  if (timeline) {
    const values = data.timeline || [];
    const labels = values.map((item, index) => new Date(`${item.date}T00:00:00`).toLocaleDateString([], index === 0 ? { month: "short", day: "numeric" } : { day: "numeric" }));
    const colors = [
      "rgba(212,124,124,0.65)",
      "rgba(107,143,212,0.75)",
      "rgba(78,201,184,0.75)",
      "rgba(95,201,143,0.75)",
    ];

    timeline.innerHTML = `
      ${values
        .map(
          (item, index) => `
            <div class="tc-bar" title="${item.messages} message${item.messages === 1 ? "" : "s"}" style="height:${Math.max(3, item.tone ?? 3)}%;background:${colors[index % colors.length]}"></div>
          `,
        )
        .join("")}
      <div class="tc-labels">
        ${labels.map((label) => `<div class="tc-label">${label}</div>`).join("")}
      </div>
    `;
  }

  const heatmap = document.getElementById("heatmap");
  if (heatmap) {
    const palette = [
      "var(--border)",
      "rgba(201,168,92,0.2)",
      "rgba(201,168,92,0.45)",
      "rgba(201,168,92,0.7)",
      "var(--gold)",
    ];

    const cells = (data.timeline || []).map((item) => {
      const level = Math.min(4, item.messages || 0);
      return `<div class="hmap-cell" title="${item.date}: ${item.messages} message${item.messages === 1 ? "" : "s"}" style="background:${palette[level]}"></div>`;
    });

    heatmap.innerHTML = cells.join("");
  }

  const weeklyGrid = document.getElementById("weekly-grid");
  if (weeklyGrid) {
    const days = data.weekly || [];

    weeklyGrid.innerHTML = days
      .map(
        ({ day: label, tone }) => `
          <div class="wday">
            <div class="wday-label">${label}</div>
            <div class="wday-bar" style="height:${Math.max(4, tone || 0)}px;background:rgba(78,201,184,0.75)"></div>
          </div>
        `,
      )
      .join("");
  }

  document.querySelectorAll("[data-mood]").forEach((cell) => {
    const count = Number(data.moods?.[cell.dataset.mood] || 0);
    cell.classList.toggle("selected", count > 0);
    cell.querySelector(".mood-cell-count").textContent = String(count);
  });
  document.getElementById("insights-timeline-meta").textContent = `${data.messageCount || 0} check-in messages`;
  document.getElementById("insights-mood-meta").textContent = `Last ${data.days} days`;
  document.getElementById("insights-activity-meta").textContent = `${data.activeDays || 0} active days`;
  const camera = data.camera || {};
  const cameraMeta = document.getElementById("camera-checkin-meta");
  const cameraSummary = document.getElementById("camera-checkin-summary");
  if (cameraMeta) cameraMeta.textContent = camera.checkInCount ? `${camera.checkInCount} opt-in check-in${camera.checkInCount === 1 ? "" : "s"}` : "No camera check-ins yet";
  if (cameraSummary && camera.checkInCount) {
    const latest = camera.latest || {};
    cameraSummary.textContent = latest.visible
      ? `Latest momentary observation: ${latest.summary || "a visual check-in was recorded"}. This is not a diagnosis.`
      : "Your latest optional camera check-in was inconclusive. This is not a diagnosis.";
  }
  document.getElementById("insights-notice").textContent = data.notice || "";
}

function relativeConversationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function renderDashboard(dashboard, conversations) {
  if (!document.querySelector("[data-dashboard-stat]")) return;
  const set = (name, value) => document.querySelectorAll(`[data-dashboard-stat="${name}"]`).forEach((element) => { element.textContent = value; });
  const frequency = Number(dashboard.conversationFrequency || 0);
  const stress = Number(dashboard.stress || 0);
  const rhythm = frequency === 0 ? "Getting started" : stress >= 70 ? "Take it gently" : frequency >= 4 ? "Steady" : "Growing";
  set("conversationFrequency", String(frequency).padStart(2, "0"));
  set("memoryCount", String(dashboard.memoryCount || 0).padStart(2, "0"));
  set("rhythm", rhythm);
  set("rhythm-detail", dashboard.dailyStreak ? `${dashboard.dailyStreak}-day check-in streak` : "your space grows with each check-in");

  const topics = dashboard.mostDiscussedTopics || [];
  const topicsElement = document.querySelector("[data-dashboard-topics]");
  if (topicsElement && topics.length) topicsElement.textContent = `You have been reflecting on ${topics.slice(0, 3).join(", ")}. Keep one small next step in view.`;
  const nudge = document.querySelector("[data-dashboard-nudge]");
  if (nudge && dashboard.dailyStreak) nudge.innerHTML = `You’re building a gentle<br><em>${dashboard.dailyStreak}-day rhythm.</em>`;

  const target = document.querySelector("[data-dashboard-threads]");
  if (!target || !Array.isArray(conversations) || !conversations.length) return;
  target.replaceChildren(...conversations.slice(0, 3).map((conversation, index) => {
    const row = document.createElement("a");
    row.className = "thread-row";
    row.href = "/chat";
    row.innerHTML = `<span class="thread-icon ${index === 1 ? "lavender" : "calm"}">${index === 1 ? "✦" : "◌"}</span><div><strong></strong><p></p></div><time></time>`;
    row.querySelector("strong").textContent = conversation.title || "Conversation";
    row.querySelector("p").textContent = (conversation.messages || []).filter((message) => message.role === "user").at(-1)?.content || "Continue your conversation";
    row.querySelector("time").textContent = relativeConversationTime(conversation.updatedAt);
    return row;
  }));
}

async function populateDashboard() {
  if (!document.querySelector("[data-dashboard-stat]")) return;
  const headers = { Authorization: `Bearer ${localStorage.getItem(STORAGE_KEYS.token) || ""}` };
  const [summaryResponse, conversationResponse] = await Promise.all([
    fetch("/api/companion/dashboard", { headers }),
    fetch("/api/chat?limit=3", { headers }),
  ]);
  if (!summaryResponse.ok || !conversationResponse.ok) throw new Error("Could not load companion dashboard.");
  const summary = await summaryResponse.json();
  renderDashboard(summary.dashboard || {}, await conversationResponse.json());
}

async function populateInsights(days = 30) {
  if (!document.getElementById("timeline-chart")) return;
  const response = await fetch(`/api/insights?days=${days}`, { headers: { Authorization: `Bearer ${localStorage.getItem(STORAGE_KEYS.token) || ""}` } });
  if (!response.ok) throw new Error("Could not load insights.");
  renderInsights(await response.json());
}

(async () => {
  initChrome();

  const session = await ensureSession({ redirectTo: "/login" });
  if (!session?.verified) {
    return;
  }

  // Starter characters should still open the live chat page after login.
  if (window.location.pathname === "/dashboard" && localStorage.getItem(STORAGE_KEYS.starterCharacter)) {
    redirect("/chat");
    return;
  }

  fillUserChrome();
  try {
    await populateDashboard();
    await populateInsights();
    document.getElementById("insight-range-picker")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-insight-days]");
      if (!button) return;
      document.querySelectorAll("[data-insight-days]").forEach((item) => item.classList.toggle("active", item === button));
      await populateInsights(Number(button.dataset.insightDays));
    });
  } catch {
    document.getElementById("insights-notice")?.replaceChildren("Insights will appear after you have a saved conversation.");
  }
})();
