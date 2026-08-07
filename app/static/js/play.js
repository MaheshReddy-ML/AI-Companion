import { apiRequest, ensureSession, escapeHtml, initChrome } from "./common.js";

const byId = (id) => document.getElementById(id);
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function makeSparkles(amount = 18) {
  const layer = byId("play-sparkles");
  if (!layer || prefersReducedMotion) return;
  layer.innerHTML = Array.from({ length: amount }, (_, index) => `<i style="--x:${(index * 37) % 100}%;--y:${(index * 61) % 92}%;--delay:-${(index % 7) * .72}s;--size:${3 + (index % 4) * 1.5}px"></i>`).join("");
}

function celebrate(button) {
  const garden = document.querySelector(".garden-preview");
  garden?.classList.remove("garden-celebrate");
  requestAnimationFrame(() => garden?.classList.add("garden-celebrate"));
  button?.classList.add("quest-complete-pop");
  window.setTimeout(() => button?.classList.remove("quest-complete-pop"), 650);
}

function renderQuests(quests) {
  byId("quest-list").innerHTML = quests.quests.map((quest, index) => `
    <article class="quest-card ${quest.completed ? "is-complete" : ""}" style="--quest-delay:${index * 80}ms">
      <span class="quest-number">0${index + 1}</span><span class="quest-spark">✦</span>
      <div class="settings-row-label"><h4>${escapeHtml(quest.title)}</h4><p>${escapeHtml(quest.description)}</p></div>
      <button class="btn ${quest.completed ? "btn-ghost" : "btn-outline"} btn-sm" data-quest="${quest.id}" ${quest.completed ? "disabled" : ""}>${quest.completed ? "Complete ✓" : "Begin ritual →"}</button>
    </article>`).join("");
}

async function load() {
  const [quests, garden, memories, space] = await Promise.all([apiRequest("/api/play/quests", { auth: true }), apiRequest("/api/play/garden", { auth: true }), apiRequest("/api/play/memories", { auth: true }), apiRequest("/api/play/space", { auth: true })]);
  renderQuests(quests);
  byId("garden-stage").textContent = `${garden.stage[0].toUpperCase()}${garden.stage.slice(1)} garden · ${garden.completedQuests} rituals`;
  byId("garden-copy").textContent = garden.message;
  document.querySelector(".garden-preview")?.setAttribute("data-stage", garden.stage);
  byId("memory-list").innerHTML = memories.memories.map((memory) => `<div class="settings-row"><span>${escapeHtml(memory.text)}</span><button class="btn btn-ghost btn-sm" data-memory="${memory.id}">Remove</button></div>`).join("") || "<p class='muted'>Nothing saved yet. You stay in control of every memory.</p>";
  for (const key of ["background", "ambience", "accessory"]) byId(`space-${key}`).value = space.space[key];
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
byId("room-form").addEventListener("submit", async (event) => { event.preventDefault(); const result = await apiRequest("/api/play/focus-rooms", { method: "POST", auth: true, body: { name: byId("room-name").value, minutes: Number(byId("room-minutes").value) } }); byId("room-status").textContent = `Invite code: ${result.room.code} · ${result.room.members} member`; });
byId("room-join").addEventListener("click", async () => { const result = await apiRequest("/api/play/focus-rooms/join", { method: "POST", auth: true, body: { code: byId("room-code").value } }); byId("room-status").textContent = `Joined ${result.room.name} · ${result.room.members} members`; });
byId("space-form").addEventListener("submit", async (event) => { event.preventDefault(); await apiRequest("/api/play/space", { method: "PUT", auth: true, body: { background: byId("space-background").value, ambience: byId("space-ambience").value, accessory: byId("space-accessory").value } }); byId("room-status").textContent = "Your atmosphere is ready."; });
byId("remix-form").addEventListener("submit", async (event) => { event.preventDefault(); const result = await apiRequest("/api/play/remix", { method: "POST", auth: true, body: { text: byId("remix-input").value, format: byId("remix-format").value } }); byId("remix-output").textContent = result.content; });

initChrome();
if (await ensureSession({ redirectTo: "/login" })) { makeSparkles(); load(); }
