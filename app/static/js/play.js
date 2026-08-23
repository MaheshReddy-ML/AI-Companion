import { accessDisplayForUser, apiRequest, ensureSession, escapeHtml, getStoredUser, getToken, guardEntitlement, hasStoredEntitlement, initChrome } from "./common.js";
import { createCinematicRoom } from "./cinematic-room.js";

const byId = (id) => document.getElementById(id);
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const playWorld = document.querySelector("[data-play-world]");
let cinematicRoom = null;
let playPayload = null;

function celebrate(button) {
  const garden = document.querySelector(".play-garden-state");
  garden?.classList.remove("garden-celebrate");
  requestAnimationFrame(() => garden?.classList.add("garden-celebrate"));
  button?.classList.add("quest-complete-pop");
  window.setTimeout(() => button?.classList.remove("quest-complete-pop"), 650);
}

function stateAction(quest) {
  if (quest.state === "LOCKED") return quest.lockReason || "Not available yet";
  if (quest.state === "COMPLETED") return "You gave this a moment ✓";
  if (quest.state === "IN_PROGRESS") return "Complete this moment →";
  if (quest.state === "REVISIT") return "Revisit →";
  return "Begin →";
}

function renderProgress(payload, garden) {
  const progress = payload.progress || {};
  playWorld.dataset.worldStage = progress.stage || garden.stage || "quiet";
  byId("play-progress-message").textContent = progress.message || garden.message;
  byId("play-progress-detail").textContent = progress.totalMoments
    ? `${progress.totalMoments} private moment${progress.totalMoments === 1 ? "" : "s"} · ${progress.activeDays || 0} day${progress.activeDays === 1 ? "" : "s"} you made room`
    : "Your first moment can be very small.";
  byId("play-progress-fill").style.width = `${Math.min(100, ((progress.totalMoments || 0) % 5 || (progress.totalMoments ? 5 : 0)) * 20)}%`;
  document.querySelectorAll("[data-world-element]").forEach((element) => {
    element.hidden = !(progress.environmentElements || garden.elements || []).includes(element.dataset.worldElement);
  });
  byId("play-daily-note").textContent = payload.personalizedBy === "latest-check-in"
    ? "Chosen with the check-in you explicitly shared. Nothing else was inferred."
    : "A small selection, ready when you are.";
  const milestones = progress.milestones || garden.milestones || [];
  byId("play-milestone-list").innerHTML = milestones.length
    ? milestones.map((item) => `<article><span>✓</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p></div></article>`).join("")
    : "<p>Your first milestone appears after one meaningful moment.</p>";
  const locked = payload.nextLocked;
  byId("play-next-unlock").hidden = !locked;
  if (locked) {
    byId("play-next-unlock-title").textContent = locked.title;
    byId("play-next-unlock-reason").textContent = locked.lockReason;
  }
}

function renderQuests(payload) {
  playPayload = payload;
  byId("quest-list").innerHTML = payload.quests.map((quest, index) => `
    <article class="ritual-fragment state-${quest.state.toLowerCase()} ${quest.completed ? "is-complete" : ""}" data-quest-card="${escapeHtml(quest.id)}" data-state="${escapeHtml(quest.state)}" data-category="${escapeHtml(quest.category)}" data-ritual-index="0${index + 1}" style="--quest-delay:${index * 80}ms">
      <span class="quest-number">${escapeHtml(quest.category)} · ${quest.minutes} MIN</span><span class="quest-spark" aria-hidden="true">✦</span>
      <div class="settings-row-label"><h4>${escapeHtml(quest.title)}</h4><p>${escapeHtml(quest.description)}</p></div>
      ${quest.state === "IN_PROGRESS" ? '<p class="ritual-in-progress"><i></i> Take the time you need. Completion is yours to choose.</p>' : ""}
      <button data-quest="${escapeHtml(quest.id)}" data-quest-state="${escapeHtml(quest.state)}" ${["LOCKED", "COMPLETED"].includes(quest.state) ? "disabled" : ""}>${escapeHtml(stateAction(quest))}</button>
    </article>`).join("");
}

async function loadPlayExperiences() {
  const [quests, garden] = await Promise.all([apiRequest("/api/play/quests", { auth: true }), apiRequest("/api/play/garden", { auth: true })]);
  renderQuests(quests);
  renderProgress(quests, garden);
  byId("garden-stage").textContent = `${garden.stage[0].toUpperCase()}${garden.stage.slice(1)} garden · ${garden.completedQuests} rituals`;
  byId("garden-copy").textContent = garden.message;
  byId("garden-count").textContent = `+${quests.quests.filter((quest) => !quest.completed).length}`;
  document.querySelector(".play-garden-state")?.setAttribute("data-stage", garden.stage);
}

async function load() {
  const [memories, space] = await Promise.all([apiRequest("/api/play/memories", { auth: true }), apiRequest("/api/play/space", { auth: true })]);
  byId("memory-list").innerHTML = memories.memories.map((memory) => `<div class="settings-row"><span>${escapeHtml(memory.text)}</span><button class="btn btn-ghost btn-sm" data-memory="${memory.id}">Remove</button></div>`).join("") || "<p class='muted'>Nothing saved yet. You stay in control of every memory.</p>";
  for (const key of ["background", "ambience", "accessory"]) byId(`space-${key}`).value = space.space[key];
  updateSpacePreview();
}

function showCompletion(result, button) {
  celebrate(button);
  const layer = byId("play-completion-layer");
  byId("play-completion-title").textContent = result.message || "One thing lighter.";
  byId("play-completion-reaction").textContent = result.emoraReaction || "Done.";
  byId("play-completion-milestone").hidden = !result.milestone;
  if (result.milestone) byId("play-completion-milestone").textContent = `${result.milestone.title} ${result.milestone.message}`;
  const nextCard = result.nextExperience
    ? document.querySelector(`[data-quest-card="${CSS.escape(result.nextExperience.id)}"]`)
    : null;
  byId("play-completion-next").hidden = !result.nextExperience;
  byId("play-completion-explore").hidden = !nextCard;
  if (result.nextExperience) {
    byId("play-completion-next-title").textContent = `${result.nextExperience.title} · ${result.nextExperience.minutes} min`;
    byId("play-completion-explore").dataset.nextQuest = result.nextExperience.id;
  }
  layer.hidden = false;
  layer.classList.remove("is-visible");
  requestAnimationFrame(() => layer.classList.add("is-visible"));
  byId("play-completion-close").focus();
}

async function loadPremiumPlay() {
  const access = getStoredUser()?.access;
  const planName = access?.planName || "Free";
  const accessDisplay = accessDisplayForUser(getStoredUser());
  byId("play-plan-kicker").textContent = accessDisplay.kicker;
  byId("play-plan-seal").textContent = accessDisplay.label;
  document.querySelectorAll("[data-play-plan-name]").forEach((element) => { element.textContent = access?.isAdmin ? "Admin controls" : `${planName} plan`; });

  if (hasStoredEntitlement("look_back")) {
    const archive = await apiRequest("/api/play/ritual-history", { auth: true });
    byId("archive-active-days").textContent = String(archive.activeDays || 0);
    byId("archive-completed").textContent = String(archive.completedRituals || 0);
    byId("archive-streak").textContent = `${archive.currentStreak || 0} day${archive.currentStreak === 1 ? "" : "s"}`;
    byId("archive-strongest").textContent = archive.strongestRitual || "Still emerging";
    byId("ritual-archive-list").innerHTML = archive.recent?.length
      ? archive.recent.map((item) => `<article><time>${escapeHtml(new Date(`${item.date}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" }))}</time><p>${item.rituals.map(escapeHtml).join(" · ")}</p></article>`).join("")
      : "<p>Your completed rituals will gather here.</p>";
  }

  if (hasStoredEntitlement("voice_postcards")) {
    const conversations = await apiRequest("/api/chat?limit=30", { auth: true });
    byId("keepsake-conversation").innerHTML = '<option value="">Choose a conversation</option>' + conversations
      .filter((conversation) => conversation.messages?.some((message) => message.role === "assistant"))
      .map((conversation) => `<option value="${escapeHtml(conversation.id)}">${escapeHtml(conversation.title)}</option>`)
      .join("");
  }
}

function updateSpacePreview() {
  const spaceMaker = document.querySelector(".play-space-maker");
  if (!spaceMaker) return;
  spaceMaker.dataset.spacePreview = byId("space-background").value;
  spaceMaker.dataset.spaceAmbience = byId("space-ambience").value;
  spaceMaker.dataset.spaceAccessory = byId("space-accessory").value;
}

function initializeCinematicRoom() {
  const mount = document.querySelector("[data-play-room-mount]");
  if (!mount) return;
  try {
    cinematicRoom = createCinematicRoom(mount, {
      imageUrl: "/static/images/emora-night-room-v1.webp",
      reducedMotion: prefersReducedMotion,
      onReady: () => playWorld?.classList.add("scene-ready"),
    });
  } catch (error) {
    console.warn("Emora Play is using its cinematic fallback.", error);
    playWorld?.classList.add("scene-ready", "scene-fallback");
  }
}

byId("quest-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-quest]");
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    if (["AVAILABLE", "REVISIT"].includes(button.dataset.questState)) {
      button.textContent = "Opening…";
      await apiRequest(`/api/play/quests/${button.dataset.quest}/start`, { method: "POST", auth: true });
      await loadPlayExperiences();
      document.querySelector(`[data-quest-card="${CSS.escape(button.dataset.quest)}"]`)?.querySelector("button")?.focus();
      return;
    }
    button.textContent = "Letting the room respond…";
    const result = await apiRequest(`/api/play/quests/${button.dataset.quest}/complete`, { method: "POST", auth: true });
    await loadPlayExperiences();
    showCompletion(result, document.querySelector(`[data-quest-card="${CSS.escape(button.dataset.quest)}"]`)?.querySelector("button"));
  } catch (error) {
    button.disabled = false;
    button.textContent = error.message || "Try again";
  }
});
byId("play-completion-close").addEventListener("click", () => { byId("play-completion-layer").hidden = true; byId("play-completion-layer").classList.remove("is-visible"); });
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || byId("play-completion-layer").hidden) return;
  byId("play-completion-layer").hidden = true;
  byId("play-completion-layer").classList.remove("is-visible");
});
byId("play-completion-explore").addEventListener("click", () => {
  const questId = byId("play-completion-explore").dataset.nextQuest;
  byId("play-completion-layer").hidden = true;
  document.querySelector(`[data-quest-card="${CSS.escape(questId || "")}"]`)?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
});
byId("memory-form").addEventListener("submit", async (event) => { event.preventDefault(); const text = byId("memory-input").value.trim(); if (!text) return; await apiRequest("/api/play/memories", { method: "POST", auth: true, body: { text } }); byId("memory-input").value = ""; await load(); });
byId("memory-list").addEventListener("click", async (event) => { const button = event.target.closest("[data-memory]"); if (!button) return; await apiRequest(`/api/play/memories/${button.dataset.memory}`, { method: "DELETE", auth: true }); await load(); });
byId("space-form").addEventListener("change", updateSpacePreview);
byId("space-form").addEventListener("submit", async (event) => { event.preventDefault(); if (!guardEntitlement("ambient_rooms")) return; await apiRequest("/api/play/space", { method: "PUT", auth: true, body: { background: byId("space-background").value, ambience: byId("space-ambience").value, accessory: byId("space-accessory").value } }); byId("space-status").textContent = "Your atmosphere is ready."; });
byId("remix-form").addEventListener("submit", async (event) => { event.preventDefault(); if (!guardEntitlement("conversation_remix")) return; const result = await apiRequest("/api/play/remix", { method: "POST", auth: true, body: { text: byId("remix-input").value, format: byId("remix-format").value } }); byId("remix-output").textContent = result.content + (result.createdGoal ? `\n\nSaved to Gentle Goals: ${result.createdGoal.title}` : ""); });
byId("keepsake-create").addEventListener("click", async () => {
  if (!guardEntitlement("voice_postcards")) return;
  const conversationId = byId("keepsake-conversation").value;
  if (!conversationId) { byId("keepsake-status").textContent = "Choose a conversation first."; return; }
  const button = byId("keepsake-create");
  button.disabled = true;
  byId("keepsake-status").textContent = "Creating your private voice keepsake…";
  try {
    const response = await fetch(`/api/play/postcard/${encodeURIComponent(conversationId)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.detail || "Could not create this voice keepsake.");
    }
    const url = URL.createObjectURL(await response.blob());
    const audio = new Audio(url);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    await audio.play();
    byId("keepsake-status").textContent = "Playing your voice keepsake.";
  } catch (error) {
    byId("keepsake-status").textContent = error.message || "Could not create this voice keepsake.";
  } finally {
    button.disabled = false;
  }
});

initChrome();
if (await ensureSession({ redirectTo: "/login" })) {
  initializeCinematicRoom();
  await Promise.all([loadPlayExperiences(), load(), loadPremiumPlay()]);
}

window.addEventListener("pagehide", () => { cinematicRoom?.dispose(); }, { once: true });
