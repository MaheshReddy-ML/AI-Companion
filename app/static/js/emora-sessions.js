import { apiRequest, ensureSession, escapeHtml, initChrome, publishEmoraPresence } from "./common.js";

const byId = (id) => document.getElementById(id);
const state = { current: null, access: null };

function setStatus(id, message, kind = "") {
  const target = byId(id);
  if (!target) return;
  target.textContent = message;
  target.className = `sessions-status ${kind}`.trim();
}

function sessionDestination(session) {
  const prompt = session.intention || ({ listen: "I would like you to listen for a while.", reflect: "Help me reflect on what is here.", plan: "Help me find one gentle next step.", focus: "Help me focus on one useful thing.", deep: "I am ready for a deeper conversation." }[session.mode]);
  if (session.channel === "voice") return `/your-emora?session=${encodeURIComponent(session.id)}&prompt=${encodeURIComponent(prompt)}`;
  return `/chat?new=1&session=${encodeURIComponent(session.id)}&mode=${encodeURIComponent(session.mode)}&prompt=${encodeURIComponent(prompt)}`;
}

function renderCurrent(session) {
  state.current = session;
  const target = byId("sessions-current");
  if (!session) {
    target.innerHTML = "<small>CURRENT SESSION</small><strong>No session in progress</strong><p>Start below whenever you are ready.</p>";
    return;
  }
  target.innerHTML = `<small>${escapeHtml(session.status.toUpperCase())} · ${escapeHtml(session.mode.toUpperCase())}</small><strong>${escapeHtml(session.intention || "A quiet session with Emora")}</strong><p>${escapeHtml(session.channel === "voice" ? "Live companion room" : "Private text conversation")} · ${escapeHtml(String(session.durationMinutes || "Open"))}${session.durationMinutes ? " minutes" : ""}</p><div><a href="${escapeHtml(sessionDestination(session))}">${session.status === "paused" ? "Resume" : "Continue"} session →</a><button type="button" data-complete-current>Complete gently</button></div>`;
}

function renderHistory(sessions) {
  const target = byId("sessions-history-list");
  const completed = sessions.filter((item) => item.status === "completed");
  target.innerHTML = completed.length ? completed.map((item) => `<article><div><strong>${escapeHtml(item.intention || `${item.mode} session`)}</strong><p>${escapeHtml(item.reflection || item.nextStep || "Completed without a saved closing note.")}</p></div><time>${item.completedAt ? new Date(item.completedAt).toLocaleDateString() : "Completed"}</time></article>`).join("") : "<p>No completed sessions yet.</p>";
}

async function loadSessions() {
  const [current, history] = await Promise.all([apiRequest("/api/premium/sessions/current", { auth: true }), apiRequest("/api/premium/sessions?limit=20", { auth: true })]);
  renderCurrent(current.session);
  renderHistory(history.sessions || []);
}

function fillReview(review) {
  byId("weekly-meaningful").value = review?.meaningful || "";
  byId("weekly-changed").value = review?.changed || "";
  byId("weekly-remember").value = review?.remember || "";
  byId("weekly-forget").value = review?.forget || "";
  byId("weekly-next-step").value = review?.nextStep || "";
}

async function loadWeeklyReview() {
  const payload = await apiRequest("/api/premium/weekly-review", { auth: true });
  const counts = payload.sources?.counts || {};
  byId("weekly-source-strip").innerHTML = ["conversations", "journals", "goals", "moments"].map((key) => `<article><strong>${Number(counts[key] || 0)}</strong><span>${escapeHtml(key)}</span></article>`).join("");
  fillReview(payload.review);
  if (!payload.available) {
    setStatus("weekly-review-status", "Weekly Review is available with Emora Plus. Your real activity counts remain visible; no review has been invented.");
  }
}

function memoryCard(item) {
  const source = item.source ? `<p class="memory-source">From “${escapeHtml(item.source.conversationTitle)}” · ${escapeHtml(item.source.excerpt)}</p>` : '<p class="memory-source">Explicitly taught or its original conversation is no longer available.</p>';
  const conflict = item.pendingConflict ? `<div class="memory-conflict"><strong>Possible change</strong><p>Emora also heard: “${escapeHtml(item.pendingConflict.value)}”. Choose Edit to confirm the current wording; nothing was replaced automatically.</p></div>` : "";
  const used = item.lastUsedAt ? `Used ${item.useCount} time${item.useCount === 1 ? "" : "s"} · last ${new Date(item.lastUsedAt).toLocaleDateString()}` : "Not used in a reply yet";
  return `<article class="memory-card" data-memory-id="${escapeHtml(item.id)}"><div><header><span>${escapeHtml(item.label)}</span><small>${escapeHtml(used)}</small></header><strong>${escapeHtml(item.value)}</strong><p>${escapeHtml(item.why)}</p>${source}${conflict}</div><aside><button type="button" data-memory-edit data-memory-value="${escapeHtml(item.value)}">Edit</button><button type="button" data-memory-expire>Expire</button><button type="button" data-memory-delete>Forget</button></aside></article>`;
}

async function loadMemoryCenter() {
  const payload = await apiRequest("/api/premium/memory-center", { auth: true });
  const target = byId("memory-center-list");
  if (!payload.available) {
    target.innerHTML = '<div class="memory-card"><div><strong>Memory Center is available with Emora Plus.</strong><p>Upgrade to review inferred memories, their source, use, expiry, and possible contradictions.</p></div><aside><a class="sessions-primary" href="/payment?feature=memory_center">View Plus</a></aside></div>';
    return;
  }
  target.innerHTML = payload.memories.length ? payload.memories.map(memoryCard).join("") : '<div class="memory-card"><div><strong>Nothing is being held yet.</strong><p>Explicit memories and reviewable personal facts will appear here.</p></div></div>';
}

byId("session-create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("session-create-status", "Preparing your private session…");
  publishEmoraPresence("SAVING");
  try {
    const session = (await apiRequest("/api/premium/sessions", { method: "POST", auth: true, body: {
      intention: byId("session-intention").value,
      mode: new FormData(event.currentTarget).get("sessionMode"),
      channel: new FormData(event.currentTarget).get("sessionChannel"),
      environment: byId("session-environment").value,
      durationMinutes: Number(byId("session-duration").value),
    } })).session;
    setStatus("session-create-status", "Session ready. Opening your chosen space…", "success");
    publishEmoraPresence("IDLE");
    window.location.assign(sessionDestination(session));
  } catch (error) { publishEmoraPresence("ERROR"); setStatus("session-create-status", error.message || "Could not start this session.", "error"); }
});

byId("sessions-current").addEventListener("click", (event) => {
  if (event.target.closest("[data-complete-current]")) byId("session-complete-dialog").showModal();
});

byId("session-complete-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.current) return;
  setStatus("session-complete-status", "Saving only what you chose…");
  publishEmoraPresence("SAVING");
  try {
    await apiRequest(`/api/premium/sessions/${encodeURIComponent(state.current.id)}/complete`, { method: "POST", auth: true, body: { reflection: byId("session-reflection").value, nextStep: byId("session-next-step").value, memoryChoice: byId("session-memory-review").checked ? "review" : "none" } });
    byId("session-complete-dialog").close();
    publishEmoraPresence("IDLE");
    window.dispatchEvent(new CustomEvent("emora:sensory-cue", { detail: { cue: "complete" } }));
    await loadSessions();
    if (byId("session-memory-review").checked) byId("memory-center").scrollIntoView({ behavior: "smooth" });
  } catch (error) { publishEmoraPresence("ERROR"); setStatus("session-complete-status", error.message || "Could not complete the session.", "error"); }
});

byId("weekly-review-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("weekly-review-status", "Saving your confirmed review…");
  publishEmoraPresence("SAVING");
  try {
    const payload = await apiRequest("/api/premium/weekly-review", { method: "PUT", auth: true, body: { meaningful: byId("weekly-meaningful").value, changed: byId("weekly-changed").value, remember: byId("weekly-remember").value, forget: byId("weekly-forget").value, nextStep: byId("weekly-next-step").value } });
    fillReview(payload.review);
    setStatus("weekly-review-status", "Weekly Review saved. Memory and goal changes still require separate confirmation.", "success");
    publishEmoraPresence("IDLE");
  } catch (error) { publishEmoraPresence("ERROR"); setStatus("weekly-review-status", error.message || "Could not save this review.", "error"); }
});

byId("memory-center-list").addEventListener("click", async (event) => {
  const row = event.target.closest("[data-memory-id]");
  if (!row) return;
  try {
    if (event.target.closest("[data-memory-edit]")) {
      const current = event.target.dataset.memoryValue || "";
      const value = window.prompt("Confirm the current wording for this memory:", current);
      if (value == null || !value.trim()) return;
      await apiRequest(`/api/premium/memory-center/${row.dataset.memoryId}`, { method: "PATCH", auth: true, body: { value: value.trim() } });
    } else if (event.target.closest("[data-memory-expire]")) {
      const days = Number(window.prompt("Expire this memory after how many days?", "30"));
      if (!Number.isInteger(days) || days < 1 || days > 3650) return;
      await apiRequest(`/api/premium/memory-center/${row.dataset.memoryId}`, { method: "PATCH", auth: true, body: { expiresInDays: days } });
    } else if (event.target.closest("[data-memory-delete]")) {
      if (!window.confirm("Forget this memory? This does not delete its original conversation.")) return;
      await apiRequest(`/api/premium/memory-center/${row.dataset.memoryId}`, { method: "DELETE", auth: true });
    } else return;
    await loadMemoryCenter();
  } catch (error) { window.alert(error.message || "Could not update this memory."); }
});

initChrome();
const session = await ensureSession({ redirectTo: "/login" });
if (session?.verified) {
  state.access = session.user?.access;
  const planOrder = ["free", "plus", "pro", "complete"];
  const environmentPlans = { midnight: "free", dawn: "free", "rainy-window": "plus", "quiet-forest": "plus", observatory: "pro", fireplace: "pro", aurora: "complete" };
  const plan = state.access?.isAdmin ? "complete" : state.access?.plan || "free";
  [...byId("session-environment").options].forEach((option) => {
    const required = environmentPlans[option.value] || "free";
    option.disabled = planOrder.indexOf(required) > planOrder.indexOf(plan);
  });
  await Promise.allSettled([loadSessions(), loadWeeklyReview(), loadMemoryCenter()]);
}
