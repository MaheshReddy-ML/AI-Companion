import { accessDisplayForUser, apiRequest, ensureSession, escapeHtml, getStoredUser, getToken, guardEntitlement, hasStoredEntitlement, initChrome } from "./common.js";
import { createCinematicRoom } from "./cinematic-room.js";

const byId = (id) => document.getElementById(id);
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const playWorld = document.querySelector("[data-play-world]");
let cinematicRoom = null;

function celebrate(button) {
  const garden = document.querySelector(".play-garden-state");
  garden?.classList.remove("garden-celebrate");
  requestAnimationFrame(() => garden?.classList.add("garden-celebrate"));
  button?.classList.add("quest-complete-pop");
  window.setTimeout(() => button?.classList.remove("quest-complete-pop"), 650);
}

function renderQuests(quests) {
  byId("quest-list").innerHTML = quests.quests.map((quest, index) => `
    <article class="ritual-fragment ${quest.completed ? "is-complete" : ""}" data-ritual-index="0${index + 1}" style="--quest-delay:${index * 80}ms">
      <span class="quest-number">0${index + 1}</span><span class="quest-spark">✦</span>
      <div class="settings-row-label"><h4>${escapeHtml(quest.title)}</h4><p>${escapeHtml(quest.description)}</p></div>
      <button data-quest="${quest.id}" ${quest.completed ? "disabled" : ""}>${quest.completed ? "Complete ✓" : "Begin ritual →"}</button>
    </article>`).join("");
}

async function load() {
  const [quests, garden, memories, space] = await Promise.all([apiRequest("/api/play/quests", { auth: true }), apiRequest("/api/play/garden", { auth: true }), apiRequest("/api/play/memories", { auth: true }), apiRequest("/api/play/space", { auth: true })]);
  renderQuests(quests);
  byId("garden-stage").textContent = `${garden.stage[0].toUpperCase()}${garden.stage.slice(1)} garden · ${garden.completedQuests} rituals`;
  byId("garden-copy").textContent = garden.message;
  byId("garden-count").textContent = `+${quests.quests.filter((quest) => !quest.completed).length}`;
  document.querySelector(".play-garden-state")?.setAttribute("data-stage", garden.stage);
  byId("memory-list").innerHTML = memories.memories.map((memory) => `<div class="settings-row"><span>${escapeHtml(memory.text)}</span><button class="btn btn-ghost btn-sm" data-memory="${memory.id}">Remove</button></div>`).join("") || "<p class='muted'>Nothing saved yet. You stay in control of every memory.</p>";
  for (const key of ["background", "ambience", "accessory"]) byId(`space-${key}`).value = space.space[key];
  updateSpacePreview();
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
  button.disabled = true; button.textContent = "Growing…";
  await apiRequest(`/api/play/quests/${button.dataset.quest}/complete`, { method: "POST", auth: true });
  celebrate(button); await load();
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
  await Promise.all([load(), loadPremiumPlay()]);
}

window.addEventListener("pagehide", () => { cinematicRoom?.dispose(); }, { once: true });
