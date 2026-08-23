import {
  STORAGE_KEYS,
  accessDisplayForUser,
  apiRequest,
  ensureSession,
  escapeHtml,
  getStoredUser,
  displayNameForUser,
  getInitials,
  initChrome,
  redirect,
  renderUserAvatar,
} from "./common.js?v=20260822-premium-space-v1";

const EMORA_STATES = new Set(["IDLE", "WAKING", "LISTENING", "THINKING", "SPEAKING", "WAITING", "INTERRUPTED", "PAUSED", "ERROR", "ENDED"]);
let dashboardPresence = null;

function setEmoraState(next, detail = "") {
  if (!EMORA_STATES.has(next)) return;
  const root = document.getElementById("dashboard-emora");
  if (!root) return;
  root.dataset.emoraState = next;
  const labels = {
    IDLE: "Present · calm", WAKING: "Waking · softly", LISTENING: "Listening · take your time",
    THINKING: "Reflecting · attentive", SPEAKING: "Responding · with care", WAITING: "Here · when you’re ready",
    INTERRUPTED: "Interrupted · listening", PAUSED: "Paused · no rush", ERROR: "Connection paused", ENDED: "Session ended",
  };
  const label = document.getElementById("emora-state-label");
  if (label) label.textContent = detail || labels[next];
}

function renderPresence(presence = {}) {
  dashboardPresence = presence;
  const arrival = presence.arrival || {};
  if (arrival.eyebrow) document.getElementById("emora-arrival-eyebrow").textContent = arrival.eyebrow;
  if (arrival.headline) document.getElementById("emora-arrival-headline").textContent = arrival.headline;
  if (arrival.prompt) document.getElementById("emora-arrival-prompt").textContent = arrival.prompt;
  if (arrival.message) document.getElementById("emora-arrival-message").textContent = arrival.message;
}

async function renderDashboardMemories() {
  const target = document.getElementById("dashboard-memory-list");
  const form = document.getElementById("dashboard-memory-form");
  if (!target || !form) return;
  const canRemember = Boolean(dashboardPresence?.capabilities?.memory);
  form.hidden = !canRemember;
  try {
    const payload = await apiRequest("/api/companion/memories", { auth: true });
    const memories = payload.memories || [];
    document.getElementById("dashboard-memory-notice").textContent = canRemember
      ? payload.notice
      : "You can still edit or forget existing details. Saving new memories is included with Emora Plus.";
    target.innerHTML = memories.length
      ? memories.slice(0, 8).map((item) => `<article data-memory-id="${escapeHtml(item.id)}"><p>${escapeHtml(item.value)}</p><div><button type="button" data-memory-edit>Edit</button><button type="button" data-memory-forget>Forget</button></div></article>`).join("")
      : `<p class="muted">${canRemember ? "Nothing is being held yet. Emora remembers only what you explicitly choose." : "No saved memories. Plus adds explicit, editable continuity—not hidden profiling."}</p>`;
  } catch (error) {
    target.innerHTML = `<p class="muted">${escapeHtml(error.message || "Memory controls are unavailable right now.")}</p>`;
  }
}

function bindDashboardMemories() {
  const section = document.getElementById("dashboard-memory");
  const form = document.getElementById("dashboard-memory-form");
  if (!section || !form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("dashboard-memory-input");
    if (!input.value.trim()) return;
    await apiRequest("/api/companion/memories", { method: "POST", auth: true, body: { value: input.value.trim() } });
    input.value = "";
    await renderDashboardMemories();
  });
  section.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-memory-id]");
    if (!row) return;
    if (event.target.closest("[data-memory-forget]")) {
      await apiRequest(`/api/companion/memories/${row.dataset.memoryId}`, { method: "DELETE", auth: true });
      await renderDashboardMemories();
    }
    if (event.target.closest("[data-memory-edit]")) {
      const current = row.querySelector("p")?.textContent || "";
      const value = window.prompt("Correct what Emora remembers", current);
      if (value?.trim() && value.trim() !== current) {
        await apiRequest(`/api/companion/memories/${row.dataset.memoryId}`, { method: "PATCH", auth: true, body: { value: value.trim() } });
        await renderDashboardMemories();
      }
    }
  });
}

function bindDashboardPresence() {
  const root = document.getElementById("dashboard-emora");
  const form = document.getElementById("emora-presence-form");
  const input = document.getElementById("emora-presence-input");
  const reply = document.getElementById("emora-presence-reply");
  const featureNote = document.getElementById("emora-feature-note");
  if (!root || !form || !input) return;
  const wake = () => {
    setEmoraState("WAKING");
    window.setTimeout(() => { setEmoraState("LISTENING"); input.focus(); }, 420);
  };
  document.getElementById("emora-wake-button")?.addEventListener("click", wake);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) { wake(); return; }
    if (/^hey[, ]+emora[.!?]*$/i.test(message)) { input.value = ""; wake(); return; }
    setEmoraState("THINKING");
    form.querySelector("button[type='submit']").disabled = true;
    try {
      const response = await apiRequest("/api/chat", { method: "POST", auth: true, body: { message, companionMode: "listen", characterName: "Emora" } });
      const text = response.aiMessage?.message || response.aiMessage?.content || "I’m here.";
      input.value = "";
      reply.textContent = text;
      setEmoraState("SPEAKING");
      window.setTimeout(() => setEmoraState("WAITING"), Math.min(5200, Math.max(1200, text.split(/\s+/).length * 130)));
    } catch (error) {
      setEmoraState("ERROR");
      reply.textContent = error.message || "Emora could not connect. Your text was not lost; you can try again.";
    } finally {
      form.querySelector("button[type='submit']").disabled = false;
    }
  });
  document.getElementById("emora-voice-wake")?.addEventListener("click", () => {
    if (!dashboardPresence?.capabilities?.voice) {
      featureNote.innerHTML = 'Voice turn-taking is included with Emora Plus. <a href="/plans">See what it adds →</a>';
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      featureNote.textContent = "Voice wake is not available in this browser. The live companion room still supports typed conversation.";
      setEmoraState("ERROR");
      return;
    }
    const recognition = new Recognition();
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => { setEmoraState("LISTENING"); featureNote.textContent = "Listening. Pauses are welcome."; };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((item) => item[0]?.transcript || "").join(" ").trim();
      input.value = transcript.replace(/^hey[, ]+emora[,.!? ]*/i, "");
      if (event.results[event.results.length - 1]?.isFinal && !input.value) wake();
    };
    recognition.onerror = () => { setEmoraState("ERROR"); featureNote.textContent = "Speech capture paused. You can continue by typing."; };
    recognition.onend = () => { if (root.dataset.emoraState === "LISTENING") setEmoraState(input.value ? "WAITING" : "PAUSED"); };
    try { recognition.start(); } catch { setEmoraState("ERROR"); }
  });
}

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

  document.querySelectorAll("[data-session-plan]").forEach((element) => {
    element.textContent = accessDisplayForUser(user).compact;
  });

  document.querySelectorAll("[data-session-greeting]").forEach((element) => {
    element.textContent = getGreeting(name);
  });

  document.querySelectorAll("[data-session-avatar]").forEach((element) => {
    renderUserAvatar(element, user, name);
  });
}

function renderInsights(data) {
  const access = getStoredUser()?.access || {};
  const planName = access.planName || "Free";
  const insightPlanName = document.getElementById("insights-plan-name");
  if (insightPlanName) insightPlanName.textContent = access.isAdmin ? "Administrator · Full Insights" : `${planName} Insights`;

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
            <div class="tc-bar" title="${item.messages} conversation message${item.messages === 1 ? "" : "s"}, ${item.checkIns || 0} arrival check-in${item.checkIns === 1 ? "" : "s"}" style="height:${Math.max(3, item.tone ?? ((item.checkIns || 0) * 18))}%;background:${colors[index % colors.length]}"></div>
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
      const moments = (item.messages || 0) + (item.checkIns || 0);
      const level = Math.min(4, moments);
      return `<div class="hmap-cell" title="${item.date}: ${moments} saved moment${moments === 1 ? "" : "s"}" style="background:${palette[level]}"></div>`;
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
  document.getElementById("insights-timeline-meta").textContent = `${(data.messageCount || 0) + (data.arrivalCount || 0)} saved moments`;
  document.getElementById("insights-mood-meta").textContent = `Last ${data.days} days`;
  document.getElementById("insights-activity-meta").textContent = `${data.activeDays || 0} active days · ${data.goalsCompleted || 0} goals completed`;
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

  const lookBack = document.getElementById("insights-lookback");
  if (lookBack) {
    const items = data.lookBack || [];
    lookBack.innerHTML = items.length
      ? items.map((item) => `<article><time>${escapeHtml(new Date(`${item.date}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" }))}</time><strong>${escapeHtml(item.mood)}</strong><p>${escapeHtml(item.note || item.tinyThing || "You checked in and made room for the day.")}</p></article>`).join("")
      : '<p class="muted text-sm">Your arrival check-ins will become a private timeline here.</p>';
  }
  const observations = document.getElementById("historical-observations");
  if (observations) {
    const items = data.historicalObservations || [];
    observations.innerHTML = items.length ? items.map((item) => `<p>${escapeHtml(item)}</p>`).join("") : `<p class="muted text-sm">${data.access?.advancedInsights ? "More observations appear as your private reflection history grows." : "Available with Emora Pro."}</p>`;
  }
  const brief = data.premiumBrief;
  if (brief) {
    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    setText("premium-brief-range", `Last ${data.days} days`);
    setText("premium-dominant-mood", String(brief.dominantMood || "Still emerging").replace(/^./, (value) => value.toUpperCase()));
    setText("premium-dominant-detail", `${brief.dominantMoodCount || 0} saved signal${brief.dominantMoodCount === 1 ? "" : "s"} in this period.`);
    setText("premium-consistency", `${brief.consistencyPercent || 0}%`);
    setText("premium-consistency-detail", `${brief.activeDays || 0} active day${brief.activeDays === 1 ? "" : "s"} in this period.`);
    setText("premium-tone-direction", brief.toneDirection || "Still emerging");
    setText("premium-tone-shift", brief.toneShift == null ? "More conversation history is needed." : `${brief.toneShift > 0 ? "+" : ""}${brief.toneShift} point change between the earlier and recent halves.`);
    setText("premium-strongest-day", brief.strongestDay || "Still emerging");
    setText("premium-topic-list", brief.topTopics?.length ? brief.topTopics.join(" · ") : "Your recurring topics will appear as your history grows.");
  }

  const reflection = data.periodReflection;
  if (reflection) {
    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    setText("period-reflection-title", reflection.title || "Your chapter with Emora");
    setText("period-explored", reflection.explored?.length ? reflection.explored.join(" · ") : "No recurring conversation theme is clear yet.");
    setText("period-returned", reflection.returnedTo ? String(reflection.returnedTo).replace(/^./, (value) => value.toUpperCase()) : "Still emerging.");
    setText("period-progress", reflection.progress?.length ? reflection.progress.join(" · ") : "No completed goal in this period yet.");
    setText("period-kept", `${reflection.journalCount || 0} private journal entr${reflection.journalCount === 1 ? "y" : "ies"} · ${reflection.memoryCount || 0} companion memor${reflection.memoryCount === 1 ? "y" : "ies"} · ${reflection.savedMoments || 0} conversation moments`);
    setText("period-revisit", reflection.revisit || "A meaningful saved moment will appear when enough history exists.");
  }

  const reflectionTimeline = document.getElementById("reflection-timeline");
  if (reflectionTimeline) {
    const entries = data.reflectionTimeline || [];
    reflectionTimeline.innerHTML = entries.length
      ? entries.map((item) => `<article data-reflection-type="${escapeHtml(item.type || "moment")}"><time>${escapeHtml(new Date(`${item.date}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }))}</time><span>${escapeHtml(String(item.type || "moment").toUpperCase())}</span><div><strong>${escapeHtml(item.title || "A private moment")}</strong><p>${escapeHtml(item.detail || "")}</p></div></article>`).join("")
      : `<p class="muted text-sm">${data.access?.advancedInsights ? "Your timeline will gather as you use Emora." : "Available with Emora Pro."}</p>`;
  }
}

function relativeConversationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function renderDashboard(dashboard, conversations, personal = {}) {
  if (!document.querySelector("[data-dashboard-stat]")) return;
  const set = (name, value) => document.querySelectorAll(`[data-dashboard-stat="${name}"]`).forEach((element) => { element.textContent = value; });
  const frequency = Number(dashboard.conversationFrequency || 0);
  const stress = Number(dashboard.stress || 0);
  const rhythm = frequency === 0 ? "Getting started" : stress >= 70 ? "Take it gently" : frequency >= 4 ? "Steady" : "Growing";
  set("conversationFrequency", String(frequency).padStart(2, "0"));
  set("memoryCount", String(dashboard.memoryCount || 0).padStart(2, "0"));
  set("rhythm", rhythm);
  const completedGoals = (personal.goals || []).filter((goal) => goal.completed).length;
  set("rhythm-detail", completedGoals ? `${completedGoals} of ${(personal.goals || []).length} goals complete` : dashboard.dailyStreak ? `${dashboard.dailyStreak}-day check-in streak` : "your space grows with each check-in");

  const topics = dashboard.mostDiscussedTopics || [];
  const topicsElement = document.querySelector("[data-dashboard-topics]");
  if (topicsElement && topics.length) topicsElement.textContent = `You have been reflecting on ${topics.slice(0, 3).join(", ")}. Keep one small next step in view.`;
  const nudge = document.querySelector("[data-dashboard-nudge]");
  if (nudge && dashboard.dailyStreak) nudge.innerHTML = `You’re building a gentle<br><em>${dashboard.dailyStreak}-day rhythm.</em>`;

  const preferences = personal.preferences || {};
  if (preferences.quietHours && nudge) nudge.innerHTML = "Quiet hours are on.<br><em>No nudges, just your space.</em>";
  if (preferences.quietHours && topicsElement) topicsElement.textContent = "Come back whenever you choose. Emora will stay calm and user-led.";
  else if (preferences.connectionReminders === false && topicsElement) topicsElement.textContent = "Your reflection space is here without connection prompts.";
  else if (preferences.streakReminders === false && nudge) nudge.innerHTML = "Your pace is your own.<br><em>No rhythm prompts.</em>";

  const latestCheckIn = personal.checkIns?.[0];
  const tinyGoal = personal.goals?.find((goal) => goal.isTinyThing && !goal.completed);
  const tinyThing = tinyGoal?.title || latestCheckIn?.tinyThing;
  const tinyTarget = document.querySelector("[data-dashboard-tiny]");
  if (tinyTarget && tinyThing) tinyTarget.innerHTML = `${escapeHtml(tinyThing)} <b>→</b>`;

  const lookBack = document.getElementById("dashboard-lookback");
  if (lookBack) {
    lookBack.closest(".overview-lookback").hidden = preferences.weeklyReflection === false;
    const moments = [
      ...(personal.checkIns || []).slice(0, 2).map((item) => ({ date: item.date, label: `Arrival · ${item.mood}`, copy: item.note || item.tinyThing || "You made space to notice how you were." })),
      ...(personal.entries || []).slice(0, 2).map((item) => ({ date: item.createdAt, label: item.title, copy: item.content })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
    lookBack.innerHTML = moments.length ? moments.map((item) => `<article><time>${escapeHtml(relativeConversationTime(item.date))}</time><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.copy)}</p></article>`).join("") : '<p class="muted">Your recent check-ins and reflections will gather here.</p>';
  }

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
  const [summaryResponse, conversationResponse, checkIns, journal, goals, preferences] = await Promise.all([
    fetch("/api/companion/dashboard", { headers }),
    fetch("/api/chat?limit=3", { headers }),
    apiRequest("/api/personal/check-ins?limit=3", { auth: true }),
    apiRequest("/api/personal/journal", { auth: true }),
    apiRequest("/api/personal/goals", { auth: true }),
    apiRequest("/api/personal/preferences", { auth: true }),
  ]);
  if (!summaryResponse.ok || !conversationResponse.ok) throw new Error("Could not load companion dashboard.");
  const summary = await summaryResponse.json();
  renderPresence(summary.presence || {});
  renderDashboard(summary.dashboard || {}, await conversationResponse.json(), { ...checkIns, ...journal, ...goals, ...preferences });
  await renderDashboardMemories();
}

function bindArrivalForm() {
  const form = document.getElementById("arrival-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("arrival-status");
    const mood = new FormData(form).get("mood");
    if (!mood) return;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    status.textContent = "Saving your private check-in…";
    try {
      const result = await apiRequest("/api/personal/check-ins", { method: "POST", auth: true, body: { mood, tinyThing: document.getElementById("arrival-tiny-thing")?.value || "" } });
      status.textContent = result.companionResponse || "Saved. That is enough for now.";
      await populateDashboard();
    } catch (error) {
      status.textContent = error.message || "Could not save this check-in.";
    } finally {
      button.disabled = false;
    }
  });
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
  bindDashboardPresence();
  bindDashboardMemories();
  bindArrivalForm();
  try {
    await populateDashboard();
    await populateInsights();
    document.getElementById("insight-range-picker")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-insight-days]");
      if (!button) return;
      document.querySelectorAll("[data-insight-days]").forEach((item) => item.classList.toggle("active", item === button));
      button.classList.add("is-loading");
      try {
        await populateInsights(Number(button.dataset.insightDays));
      } finally {
        button.classList.remove("is-loading");
      }
    });
    document.querySelectorAll("[data-mood]").forEach((cell) => {
      cell.addEventListener("click", () => {
        document.querySelectorAll("[data-mood]").forEach((item) => item.classList.toggle("is-focused", item === cell));
        const count = cell.querySelector(".mood-cell-count")?.textContent || "0";
        document.getElementById("insights-notice")?.replaceChildren(`${cell.querySelector("p")?.textContent || "This"} appeared in ${count} saved check-in${count === "1" ? "" : "s"} for the selected range.`);
      });
    });
  } catch {
    document.getElementById("insights-notice")?.replaceChildren("Insights will appear after you have a saved conversation.");
  }
})();
