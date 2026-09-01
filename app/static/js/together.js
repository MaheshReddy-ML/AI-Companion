import { apiRequest, ensureSession, escapeHtml, initChrome, showStatus } from "./common.js?v=20260830-together-v1";

const byId = (id) => document.getElementById(id);
const elements = {
  status: byId("together-state"), presenceCard: document.querySelector(".together-presence-card"), presenceSelect: byId("together-presence-select"), presenceLabel: byId("together-presence-label"),
  onlineCount: byId("together-online-count"), friendCount: byId("together-friend-count"), circleCount: byId("together-circle-count"), requestCount: byId("together-request-count"), outgoingCount: byId("together-outgoing-count"),
  friendForm: byId("together-friend-form"), friendEmail: byId("together-friend-email"), requestList: byId("together-request-list"), outgoingList: byId("together-outgoing-list"), friendGrid: byId("together-friend-grid"),
  newCircle: byId("together-new-circle"), circleDialog: byId("together-circle-dialog"), circleForm: byId("together-circle-form"), circleName: byId("together-circle-name"), circleStatus: byId("together-circle-form-status"), memberPicker: byId("together-member-picker"),
  circleList: byId("together-circle-list"), circleRoom: byId("together-circle-room"), roomEmpty: byId("together-room-empty"), roomContent: byId("together-room-content"), roomKind: byId("together-room-kind"), roomName: byId("together-room-name"), memberStack: byId("together-member-stack"),
  circleMenu: byId("together-circle-menu"), circleControls: byId("together-circle-controls"), addMember: byId("together-add-member"), leaveCircle: byId("together-leave-circle"),
  activity: byId("together-activity"), activityKind: byId("together-activity-kind"), activityPrompt: byId("together-activity-prompt"), activityForm: byId("together-activity-form"), activityResponse: byId("together-activity-response"), activityResponses: byId("together-activity-responses"),
  messageList: byId("together-message-list"), messageForm: byId("together-message-form"), messageInput: byId("together-message-input"),
  memberDialog: byId("together-member-dialog"), memberForm: byId("together-member-form"), addMemberPicker: byId("together-add-member-picker"), memberStatus: byId("together-member-form-status"),
};

const state = { friends: [], incoming: [], outgoing: [], circles: [], activeCircleId: "", presence: "online", loading: false, mutation: false, circleSignature: "" };
let refreshTimer = 0;

function avatar(person, { status = true } = {}) {
  return `<span class="together-person-avatar"><img src="${escapeHtml(person.avatarUrl || "/static/images/emora-logo-v2-64.png")}" alt=""><i ${status ? "" : "hidden"} aria-hidden="true"></i></span>`;
}

function presenceCopy(value) {
  return { online: "Online now", away: "Away", hidden: "Appearing offline", offline: "Offline" }[value] || "Offline";
}

function renderPresence() {
  elements.presenceSelect.value = state.presence;
  elements.presenceCard.dataset.presence = state.presence;
  elements.presenceLabel.textContent = state.presence === "hidden" ? "Appearing offline" : state.presence === "away" ? "Visible as away" : "Visible to friends";
}

function renderRequests() {
  elements.requestCount.textContent = String(state.incoming.length);
  elements.outgoingCount.textContent = String(state.outgoing.length);
  elements.requestList.innerHTML = state.incoming.length ? state.incoming.map((person) => `
    <article class="together-request-item" data-presence="${escapeHtml(person.presence)}">
      ${avatar(person)}<div><strong>${escapeHtml(person.name)}</strong><small>Wants to connect privately</small></div>
      <div class="together-request-actions"><button type="button" data-request-response="accept" data-request-id="${escapeHtml(person.requestId)}">Accept</button><button type="button" data-request-response="decline" data-request-id="${escapeHtml(person.requestId)}">Decline</button></div>
    </article>`).join("") : '<p class="together-empty">No requests waiting.</p>';
  elements.outgoingList.innerHTML = state.outgoing.length ? state.outgoing.map((person) => `
    <article class="together-outgoing-item">${avatar(person,{status:false})}<div><strong>${escapeHtml(person.name)}</strong><small>Waiting for their response</small></div></article>`).join("") : '<p class="together-empty">No sent requests are waiting.</p>';
}

function renderFriends() {
  const online = state.friends.filter((person) => person.presence === "online").length;
  elements.onlineCount.textContent = String(online);
  elements.friendCount.textContent = String(state.friends.length);
  document.querySelectorAll("[data-together-online]").forEach((badge) => { badge.textContent = online ? String(online) : ""; badge.hidden = !online; });
  elements.friendGrid.innerHTML = state.friends.length ? state.friends.map((person) => `
    <article class="together-friend-card" data-presence="${escapeHtml(person.presence)}">
      ${avatar(person)}<h3>${escapeHtml(person.name)}</h3><span>${escapeHtml(presenceCopy(person.presence))}</span>
      <div class="together-friend-actions"><button type="button" data-friend-menu="${escapeHtml(person.id)}" aria-label="Friend controls" aria-expanded="false">•••</button><div class="together-friend-menu" data-friend-menu-panel="${escapeHtml(person.id)}" hidden><button type="button" data-friend-action="remove" data-friend-id="${escapeHtml(person.id)}">Remove friend</button><button type="button" data-friend-action="block" data-friend-id="${escapeHtml(person.id)}">Block account</button></div></div>
    </article>`).join("") : '<div class="together-empty-card"><span>∞</span><h3>Your friend space is quiet.</h3><p>Send a private request above. Accepted friends will appear here with the availability they choose.</p></div>';
}

function memberChoices({ radio = false, exclude = [] } = {}) {
  const available = state.friends.filter((person) => !exclude.includes(person.id));
  if (!available.length) return '<p class="together-empty">No accepted friend is available for this circle.</p>';
  return available.map((person) => `<label class="together-member-choice" data-presence="${escapeHtml(person.presence)}"><input type="${radio ? "radio" : "checkbox"}" name="circle-member" value="${escapeHtml(person.id)}">${avatar(person)}<strong>${escapeHtml(person.name)}</strong></label>`).join("");
}

function selectedCircle() { return state.circles.find((circle) => circle.id === state.activeCircleId) || null; }

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Now" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderActivity(circle) {
  const activity = circle.activity;
  elements.activity.hidden = !activity;
  if (!activity) return;
  elements.activityKind.textContent = String(activity.type || "circle prompt").replaceAll("_", " ").toUpperCase();
  elements.activityPrompt.textContent = activity.prompt || "";
  elements.activityForm.dataset.activityId = activity.id;
  elements.activityResponses.innerHTML = activity.responses?.length ? activity.responses.map((item) => `<article class="together-activity-response"><strong>${escapeHtml(item.memberName)}</strong><p>${escapeHtml(item.response)}</p></article>`).join("") : '<p class="together-empty">Answers will appear here for everyone in the circle.</p>';
}

function renderMessages(circle) {
  elements.messageList.innerHTML = circle.messages?.length ? circle.messages.map((message) => `<article class="together-message${message.mine ? " mine" : ""}"><strong>${escapeHtml(message.senderName)}</strong><p>${escapeHtml(message.message)}</p><time>${escapeHtml(formatTime(message.createdAt))}</time></article>`).join("") : '<p class="together-empty">Say hello when you are ready.</p>';
  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

function renderActiveCircle() {
  const circle = selectedCircle();
  elements.circleRoom.dataset.empty = String(!circle);
  elements.roomEmpty.hidden = Boolean(circle);
  elements.roomContent.hidden = !circle;
  if (!circle) return;
  elements.roomKind.textContent = `${String(circle.kind).toUpperCase()} · ${circle.members.length} MEMBER${circle.members.length === 1 ? "" : "S"}`;
  elements.roomName.textContent = circle.name;
  elements.memberStack.innerHTML = circle.members.map((person) => `<span data-presence="${escapeHtml(person.presence)}" title="${escapeHtml(`${person.name} · ${presenceCopy(person.presence)}`)}">${avatar(person)}</span>`).join("");
  elements.addMember.hidden = !circle.isOwner || circle.kind !== "group" || circle.members.length >= 8;
  elements.leaveCircle.textContent = circle.isOwner ? "Delete circle" : "Leave circle";
  renderActivity(circle);
  renderMessages(circle);
}

function renderCircles() {
  elements.circleCount.textContent = String(state.circles.length);
  if (state.activeCircleId && !state.circles.some((circle) => circle.id === state.activeCircleId)) state.activeCircleId = "";
  if (!state.activeCircleId && state.circles.length) state.activeCircleId = new URLSearchParams(location.search).get("circle") || state.circles[0].id;
  elements.circleList.innerHTML = state.circles.length ? state.circles.map((circle) => `<button class="${circle.id === state.activeCircleId ? "active" : ""}" type="button" data-circle-id="${escapeHtml(circle.id)}"><strong>${escapeHtml(circle.name)}</strong><span>${escapeHtml(circle.kind)} · ${circle.members.length} members</span></button>`).join("") : '<p class="together-empty">No circles yet.</p>';
  const active = selectedCircle();
  const signature = active ? `${active.id}:${active.updatedAt}:${active.messages?.length || 0}:${active.activity?.id || ""}:${active.activity?.responses?.length || 0}` : "empty";
  if (signature !== state.circleSignature) { state.circleSignature = signature; renderActiveCircle(); }
}

function render() { renderPresence(); renderRequests(); renderFriends(); renderCircles(); }

async function loadState({ quiet = false } = {}) {
  if (state.loading || state.mutation) return;
  state.loading = true;
  try {
    const payload = await apiRequest("/api/together", { auth: true, cache: "no-store" });
    state.friends = payload.friends || []; state.incoming = payload.incomingRequests || []; state.outgoing = payload.outgoingRequests || []; state.circles = payload.circles || []; state.presence = payload.presence || state.presence;
    render();
    if (!quiet) showStatus(elements.status, "Your private friend space is ready.", "success");
  } catch (error) { showStatus(elements.status, error.message, "error"); }
  finally { state.loading = false; }
}

async function mutate(path, options, success) {
  state.mutation = true;
  showStatus(elements.status, "Updating your private space…", "loading");
  try { const payload = await apiRequest(path, { ...options, auth: true }); showStatus(elements.status, success || payload.message || "Updated.", "success"); return payload; }
  catch (error) { showStatus(elements.status, error.message, "error"); throw error; }
  finally { state.mutation = false; }
}

async function heartbeat() {
  try { await apiRequest("/api/together/presence", { method: "POST", auth: true, body: { visibility: state.presence }, cache: "no-store" }); }
  catch (_) { /* the visible status surface is updated by the next state refresh */ }
}

elements.presenceSelect.addEventListener("change", async () => {
  const previous = state.presence; state.presence = elements.presenceSelect.value; renderPresence();
  try { await heartbeat(); showStatus(elements.status, state.presence === "hidden" ? "You now appear offline." : `Friends can now see you as ${state.presence}.`, "success"); }
  catch (_) { state.presence = previous; renderPresence(); }
});

elements.friendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try { const payload = await mutate("/api/together/friends/requests", { method: "POST", body: { email: elements.friendEmail.value } }); elements.friendEmail.value = ""; showStatus(elements.status, payload.message, "success"); await loadState({quiet:true}); } catch (_) { /* status already rendered */ }
});

elements.requestList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-request-response]"); if (!button) return;
  button.disabled = true;
  try { await mutate(`/api/together/friends/requests/${encodeURIComponent(button.dataset.requestId)}/respond`, { method: "POST", body: { response: button.dataset.requestResponse } }); await loadState({quiet:true}); } catch (_) { button.disabled = false; }
});

elements.friendGrid.addEventListener("click", async (event) => {
  const menu = event.target.closest("[data-friend-menu]");
  if (menu) { const panel = elements.friendGrid.querySelector(`[data-friend-menu-panel="${CSS.escape(menu.dataset.friendMenu)}"]`); const open = panel.hidden; elements.friendGrid.querySelectorAll(".together-friend-menu").forEach((item) => { item.hidden = true; }); panel.hidden = !open; menu.setAttribute("aria-expanded", String(open)); return; }
  const action = event.target.closest("[data-friend-action]"); if (!action) return;
  const blocking = action.dataset.friendAction === "block";
  if (!window.confirm(blocking ? "Block this account? You will leave shared circles you do not own, and they will be removed from circles you own." : "Remove this friend? Existing circle membership will remain until someone leaves or removes it.")) return;
  try { await mutate(`/api/together/friends/${encodeURIComponent(action.dataset.friendId)}${blocking ? "/block" : ""}`, { method: blocking ? "POST" : "DELETE" }); await loadState({quiet:true}); } catch (_) { /* status already rendered */ }
});

function openDialog(dialog) { if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", ""); }
function closeDialog(dialog) { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); }
document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => closeDialog(button.closest("dialog"))));

elements.newCircle.addEventListener("click", () => { elements.memberPicker.innerHTML = memberChoices({radio:true}); showStatus(elements.circleStatus, "", ""); openDialog(elements.circleDialog); });
document.querySelectorAll('input[name="circle-kind"]').forEach((input) => input.addEventListener("change", () => { elements.memberPicker.innerHTML = memberChoices({radio: input.value !== "group"}); }));

elements.circleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const kind = elements.circleForm.querySelector('input[name="circle-kind"]:checked')?.value || "duo";
  const memberIds = [...elements.memberPicker.querySelectorAll('input[name="circle-member"]:checked')].map((input) => input.value);
  if ((kind === "duo" || kind === "couple") && memberIds.length !== 1) { showStatus(elements.circleStatus, `Choose exactly one friend for a ${kind}.`, "error"); return; }
  if (kind === "group" && !memberIds.length) { showStatus(elements.circleStatus, "Choose at least one friend for the group.", "error"); return; }
  try { const payload = await mutate("/api/together/circles", { method: "POST", body: { name: elements.circleName.value, kind, memberIds } }, "Circle created."); state.activeCircleId = payload.circle.id; elements.circleForm.reset(); closeDialog(elements.circleDialog); await loadState({quiet:true}); } catch (error) { showStatus(elements.circleStatus, error.message, "error"); }
});

elements.circleList.addEventListener("click", (event) => { const button = event.target.closest("[data-circle-id]"); if (!button) return; state.activeCircleId = button.dataset.circleId; state.circleSignature = ""; renderCircles(); history.replaceState({}, "", `/together?circle=${encodeURIComponent(state.activeCircleId)}`); });
elements.circleMenu.addEventListener("click", () => { const open = elements.circleControls.hidden; elements.circleControls.hidden = !open; elements.circleMenu.setAttribute("aria-expanded", String(open)); });

elements.addMember.addEventListener("click", () => { const circle = selectedCircle(); if (!circle) return; elements.addMemberPicker.innerHTML = memberChoices({radio:true,exclude:circle.members.map((person)=>person.id)}); showStatus(elements.memberStatus,"",""); openDialog(elements.memberDialog); });
elements.memberForm.addEventListener("submit", async (event) => { event.preventDefault(); const selected = elements.addMemberPicker.querySelector('input[name="circle-member"]:checked'); if (!selected) { showStatus(elements.memberStatus,"Choose one accepted friend.","error"); return; } try { await mutate(`/api/together/circles/${encodeURIComponent(state.activeCircleId)}/members`, {method:"POST",body:{memberId:selected.value}}, "Friend added to the circle."); closeDialog(elements.memberDialog); await loadState({quiet:true}); } catch(error) { showStatus(elements.memberStatus,error.message,"error"); } });

elements.leaveCircle.addEventListener("click", async () => { const circle = selectedCircle(); if (!circle || !window.confirm(circle.isOwner ? "Delete this circle and its messages for every member?" : "Leave this circle?")) return; try { await mutate(`/api/together/circles/${encodeURIComponent(circle.id)}`, {method:"DELETE"}); state.activeCircleId=""; state.circleSignature=""; history.replaceState({},"","/together"); await loadState({quiet:true}); } catch (_) { /* status already rendered */ } });

document.querySelectorAll("[data-circle-activity]").forEach((button) => button.addEventListener("click", async () => { if (!state.activeCircleId) return; try { const payload = await mutate(`/api/together/circles/${encodeURIComponent(state.activeCircleId)}/activities`, {method:"POST",body:{activityType:button.dataset.circleActivity}}, "A new circle prompt is live."); state.circles = state.circles.map((item)=>item.id===payload.circle.id?payload.circle:item); state.circleSignature=""; renderCircles(); } catch (_) { /* status already rendered */ } }));

elements.activityForm.addEventListener("submit", async (event) => { event.preventDefault(); const activityId = elements.activityForm.dataset.activityId; if (!state.activeCircleId || !activityId) return; try { const payload = await mutate(`/api/together/circles/${encodeURIComponent(state.activeCircleId)}/activities/${encodeURIComponent(activityId)}/responses`, {method:"POST",body:{response:elements.activityResponse.value}}, "Answer shared with your circle."); elements.activityResponse.value=""; state.circles = state.circles.map((item)=>item.id===payload.circle.id?payload.circle:item); state.circleSignature=""; renderCircles(); } catch (_) { /* status already rendered */ } });

elements.messageForm.addEventListener("submit", async (event) => { event.preventDefault(); if (!state.activeCircleId) return; const message = elements.messageInput.value.trim(); if (!message) return; elements.messageInput.value=""; try { const payload = await mutate(`/api/together/circles/${encodeURIComponent(state.activeCircleId)}/messages`, {method:"POST",body:{message}}, "Message sent privately."); state.circles = state.circles.map((item)=>item.id===payload.circle.id?payload.circle:item); state.circleSignature=""; renderCircles(); } catch (_) { elements.messageInput.value=message; } });

async function init() {
  initChrome();
  const session = await ensureSession(); if (!session) return;
  state.presence = localStorage.getItem("emora:together-presence") || "online";
  elements.presenceSelect.addEventListener("change", () => localStorage.setItem("emora:together-presence", elements.presenceSelect.value));
  await heartbeat(); await loadState();
  refreshTimer = window.setInterval(() => loadState({quiet:true}), 7000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { heartbeat(); loadState({quiet:true}); } });
}

window.addEventListener("pagehide", () => { clearInterval(refreshTimer); });
init();
