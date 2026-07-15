import { apiRequest, ensureSession, escapeHtml, initChrome } from "./common.js";

const byId = (id) => document.getElementById(id);
async function load() {
  const [quests, garden, memories, space] = await Promise.all([apiRequest("/api/play/quests", { auth: true }), apiRequest("/api/play/garden", { auth: true }), apiRequest("/api/play/memories", { auth: true }), apiRequest("/api/play/space", { auth: true })]);
  byId("quest-list").innerHTML = quests.quests.map((quest) => `<div class="settings-row"><div class="settings-row-label"><h4>${escapeHtml(quest.title)}</h4><p>${escapeHtml(quest.description)}</p></div><button class="btn btn-outline btn-sm" data-quest="${quest.id}" ${quest.completed ? "disabled" : ""}>${quest.completed ? "Done" : "Complete"}</button></div>`).join("");
  byId("garden-stage").textContent = `${garden.stage[0].toUpperCase()}${garden.stage.slice(1)} garden · ${garden.completedQuests} quests`;
  byId("garden-copy").textContent = garden.message;
  byId("memory-list").innerHTML = memories.memories.map((memory) => `<div class="settings-row"><span>${escapeHtml(memory.text)}</span><button class="btn btn-ghost btn-sm" data-memory="${memory.id}">Remove</button></div>`).join("") || "<p class='muted'>Nothing saved yet. You stay in control of every memory.</p>";
  for (const key of ["background", "ambience", "accessory"]) byId(`space-${key}`).value = space.space[key];
}
byId("quest-list").addEventListener("click", async (event) => { const button = event.target.closest("[data-quest]"); if (!button) return; await apiRequest(`/api/play/quests/${button.dataset.quest}/complete`, { method: "POST", auth: true }); load(); });
byId("memory-form").addEventListener("submit", async (event) => { event.preventDefault(); const text = byId("memory-input").value.trim(); if (!text) return; await apiRequest("/api/play/memories", { method: "POST", auth: true, body: { text } }); byId("memory-input").value = ""; load(); });
byId("memory-list").addEventListener("click", async (event) => { const button = event.target.closest("[data-memory]"); if (!button) return; await apiRequest(`/api/play/memories/${button.dataset.memory}`, { method: "DELETE", auth: true }); load(); });
byId("room-form").addEventListener("submit", async (event) => { event.preventDefault(); const result = await apiRequest("/api/play/focus-rooms", { method: "POST", auth: true, body: { name: byId("room-name").value, minutes: Number(byId("room-minutes").value) } }); byId("room-status").textContent = `Invite code: ${result.room.code} · ${result.room.members} member`; });
byId("room-join").addEventListener("click", async () => { const result = await apiRequest("/api/play/focus-rooms/join", { method: "POST", auth: true, body: { code: byId("room-code").value } }); byId("room-status").textContent = `Joined ${result.room.name} · ${result.room.members} members`; });
byId("space-form").addEventListener("submit", async (event) => { event.preventDefault(); await apiRequest("/api/play/space", { method: "PUT", auth: true, body: { background: byId("space-background").value, ambience: byId("space-ambience").value, accessory: byId("space-accessory").value } }); });
byId("remix-form").addEventListener("submit", async (event) => { event.preventDefault(); const result = await apiRequest("/api/play/remix", { method: "POST", auth: true, body: { text: byId("remix-input").value, format: byId("remix-format").value } }); byId("remix-output").textContent = result.content; });
initChrome(); if (await ensureSession({ redirectTo: "/login" })) load();
