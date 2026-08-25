import {
  accessDisplayForUser, apiRequest, copyText, ensureSession, escapeHtml,
  getStoredUser, getToken, guardEntitlement, initChrome,
} from "./common.js?v=20260823-focus-realtime-v2";

const byId = (id) => document.getElementById(id);
const CONNECTION_KEY = "emora:focus-room-connection";
const state = {
  activeRoom: null,
  clockOffsetMs: 0,
  connectionId: sessionStorage.getItem(CONNECTION_KEY) || crypto.randomUUID(),
  countdownId: null,
  streamController: null,
  reconnectTimerId: null,
  reconnectAttempts: 0,
  sending: false,
  messageSignature: "",
  unlimitedSelected: false,
  mentionOpen: false,
};
sessionStorage.setItem(CONNECTION_KEY, state.connectionId);

function renderAccess() {
  const display = accessDisplayForUser(getStoredUser());
  byId("focus-access-kicker").textContent = display.kicker;
  byId("focus-access-label").textContent = display.label;
}

function setStatus(message, tone = "") {
  const status = byId("focus-room-status");
  status.textContent = message;
  status.dataset.state = tone;
}

function setConnectionStatus(value) {
  const label = byId("focus-chat-presence");
  if (!label) return;
  label.textContent = value;
  label.closest(".focus-chat-presence")?.setAttribute("data-state", value.toLowerCase().replaceAll(" ", "-"));
}

function stopCountdown() {
  if (state.countdownId) window.clearInterval(state.countdownId);
  state.countdownId = null;
}

function stopRealtime() {
  state.streamController?.abort();
  state.streamController = null;
  if (state.reconnectTimerId) window.clearTimeout(state.reconnectTimerId);
  state.reconnectTimerId = null;
  stopCountdown();
}

function formatMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderFocusSources(webSearch) {
  const sources = Array.isArray(webSearch?.sources) ? webSearch.sources : [];
  if (!sources.length) return "";
  return `<details class="focus-web-sources"><summary>⌕ Web sources · ${sources.length}</summary>${sources.map((source) => `<a href="${escapeHtml(source.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title || source.domain || "Source")}</a>`).join("")}</details>`;
}

function renderMessages(messages = [], replyPending = false) {
  const container = byId("focus-chat-messages");
  const shouldStick = container.scrollHeight - container.scrollTop - container.clientHeight < 90;
  const signature = messages.map((message) => message.id).join(":") + `:${replyPending}`;
  if (signature !== state.messageSignature) {
    state.messageSignature = signature;
    container.innerHTML = messages.length
      ? messages.map((message) => `
          <article class="focus-chat-message ${message.senderType === "EMORA" ? "from-emora" : message.mine ? "from-you" : "from-member"}">
            <div><strong>${escapeHtml(message.sender)}</strong><time>${escapeHtml(formatMessageTime(message.createdAt))}</time></div>
            <p>${escapeHtml(message.content)}</p>
            ${message.senderType === "EMORA" ? renderFocusSources(message.webSearch) : ""}
          </article>`).join("")
      : '<div class="focus-chat-empty"><span>✦</span><p>This room is quiet for now. Write to everyone, or mention @emora when the group wants her help.</p></div>';
    if (shouldStick || messages.length <= 2) container.scrollTop = container.scrollHeight;
  }
  byId("focus-emora-typing").hidden = !replyPending;
}

function renderParticipants(participants = []) {
  byId("focus-participants").hidden = false;
  byId("focus-participant-list").innerHTML = participants.length
    ? participants.map((participant) => `<li data-mine="${participant.mine}">${escapeHtml(participant.name)}${participant.mine ? " (you)" : ""}</li>`).join("")
    : "<li>Waiting for presence…</li>";
}

function updateRemaining() {
  const room = state.activeRoom;
  if (!room) return;
  const value = byId("focus-live-time");
  const label = byId("focus-time-label");
  if (room.status === "ENDED") {
    value.textContent = "Ended";
    label.textContent = "session";
    return;
  }
  if (room.unlimited || !room.endsAt) {
    value.textContent = "Unlimited";
    label.textContent = "open-ended";
    return;
  }
  const remainingMs = Math.max(0, new Date(room.endsAt).getTime() - (Date.now() + state.clockOffsetMs));
  const totalSeconds = Math.ceil(remainingMs / 1000);
  value.textContent = `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  label.textContent = "remaining";
}

function startCountdown(room) {
  stopCountdown();
  updateRemaining();
  if (room.status === "ACTIVE" && room.endsAt) state.countdownId = window.setInterval(updateRemaining, 250);
}

function hideMentionMenu() {
  state.mentionOpen = false;
  byId("focus-mention-menu").hidden = true;
  byId("focus-chat-input").setAttribute("aria-expanded", "false");
}

function setComposerEnded(ended) {
  const form = byId("focus-chat-form");
  const input = byId("focus-chat-input");
  const button = form.querySelector("button[type='submit']");
  form.dataset.ended = String(ended);
  input.disabled = ended;
  button.disabled = ended || state.sending;
  input.placeholder = ended ? "This session has ended." : "Write to the room and Emora…";
  if (ended) hideMentionMenu();
}

function renderRoom(room, { statusMessage = "" } = {}) {
  const previousCode = state.activeRoom?.code;
  state.activeRoom = room;
  const serverNow = Date.parse(room.serverNow);
  if (Number.isFinite(serverNow)) state.clockOffsetMs = serverNow - Date.now();
  const ended = room.status === "ENDED";
  const liveCard = byId("focus-live-room");
  liveCard.dataset.active = "true";
  liveCard.dataset.status = room.status;
  byId("focus-live-name").textContent = ended ? "Session ended" : room.name;
  byId("focus-live-members").textContent = String(room.members);
  byId("focus-member-plural").textContent = room.members === 1 ? "" : "s";
  byId("focus-live-code").textContent = room.code;
  byId("focus-code-wrap").hidden = false;
  byId("focus-shared-chat").hidden = false;
  byId("focus-end-session").hidden = ended || !room.isHost;
  byId("focus-reflect-session").hidden = ended || !room.isHost;
  const reflection = room.reflection;
  byId("focus-session-reflection").hidden = !reflection;
  if (reflection) {
    byId("focus-session-reflection-text").textContent = reflection.text || "";
    byId("focus-session-reflection-meta").textContent = `${reflection.elapsedMinutes || 1} min · requested by ${reflection.requestedBy || "a member"} · not saved as personal memory`;
  }
  renderParticipants(room.participants);
  renderMessages(room.messages, room.replyPending);
  setComposerEnded(ended);
  startCountdown(room);

  if (ended) {
    setStatus("This session has ended. Its shared conversation has been deleted.", "ended");
    setConnectionStatus("Room ended");
  } else if (statusMessage) {
    setStatus(statusMessage, "success");
  } else if (previousCode !== room.code) {
    setStatus(room.unlimited ? "This open-ended room stays active until the host ends it." : "The room timer is synchronized with the server.", "success");
  }
}

function parseEventBlock(block) {
  let eventName = "message";
  const data = [];
  block.split(/\r?\n/).forEach((line) => {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  });
  if (eventName !== "room" || !data.length) return;
  const payload = JSON.parse(data.join("\n"));
  if (payload.room?.code === state.activeRoom?.code) renderRoom(payload.room);
}

async function connectRoomStream(code) {
  state.streamController?.abort();
  const controller = new AbortController();
  state.streamController = controller;
  setConnectionStatus(state.reconnectAttempts ? "Reconnecting" : "Connecting");
  try {
    const response = await fetch(`/api/play/focus-rooms/${encodeURIComponent(code)}/events?connection_id=${encodeURIComponent(state.connectionId)}`, {
      headers: { Authorization: `Bearer ${getToken()}`, Accept: "text/event-stream" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`Room stream failed (${response.status})`);
    state.reconnectAttempts = 0;
    setConnectionStatus("Room connected");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (block && !block.startsWith(":")) parseEventBlock(block);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (state.activeRoom?.code === code && state.activeRoom.status === "ACTIVE") throw new Error("Room stream closed");
  } catch (error) {
    if (error.name === "AbortError" || state.activeRoom?.code !== code || state.activeRoom?.status === "ENDED") return;
    state.reconnectAttempts += 1;
    setConnectionStatus("Reconnecting");
    const delay = Math.min(1000 * (2 ** (state.reconnectAttempts - 1)), 15000);
    state.reconnectTimerId = window.setTimeout(() => void connectRoomStream(code), delay);
  }
}

function activateRoom(room, options = {}) {
  const changedRoom = state.activeRoom?.code && state.activeRoom.code !== room.code;
  if (changedRoom) stopRealtime();
  renderRoom(room, options);
  if (room.status === "ACTIVE" && (changedRoom || !state.streamController)) void connectRoomStream(room.code);
}

async function recoverCurrentRoom() {
  try {
    const result = await apiRequest(`/api/play/focus-rooms/current?connection_id=${encodeURIComponent(state.connectionId)}`, { auth: true, cache: "no-store" });
    if (result.room) activateRoom(result.room, { statusMessage: "Your active room and shared conversation were restored." });
  } catch (error) {
    if (error.status !== 403) setStatus(error.message || "Could not restore your active room.", "error");
  }
}

function selectDuration(button) {
  state.unlimitedSelected = button.dataset.focusUnlimited === "true";
  document.querySelectorAll("[data-focus-minutes], [data-focus-unlimited]").forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-checked", String(active));
    item.tabIndex = active ? 0 : -1;
  });
  const input = byId("focus-room-minutes");
  input.disabled = state.unlimitedSelected;
  input.closest("label").dataset.disabled = String(state.unlimitedSelected);
  if (!state.unlimitedSelected) input.value = button.dataset.focusMinutes;
}

const focusDurationButtons = [...document.querySelectorAll("[data-focus-minutes], [data-focus-unlimited]")];
focusDurationButtons.forEach((button) => {
  button.addEventListener("click", () => selectDuration(button));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = focusDurationButtons.indexOf(button);
    const next = event.key === "Home" ? focusDurationButtons[0] : event.key === "End" ? focusDurationButtons.at(-1) : focusDurationButtons[(index + (event.key === "ArrowRight" ? 1 : -1) + focusDurationButtons.length) % focusDurationButtons.length];
    next.focus();
    selectDuration(next);
  });
});
byId("focus-room-minutes").addEventListener("input", () => {
  state.unlimitedSelected = false;
  const minutes = byId("focus-room-minutes").value;
  document.querySelectorAll("[data-focus-minutes], [data-focus-unlimited]").forEach((button) => {
    const active = button.dataset.focusMinutes === minutes;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
    button.tabIndex = active ? 0 : -1;
  });
});

byId("focus-room-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!guardEntitlement("focus_rooms")) return;
  const button = event.currentTarget.querySelector("[type='submit']");
  button.disabled = true;
  setStatus("Preparing your private room…", "loading");
  try {
    const result = await apiRequest("/api/play/focus-rooms", {
      method: "POST", auth: true,
      body: {
        name: byId("focus-room-name").value,
        minutes: state.unlimitedSelected ? null : Number(byId("focus-room-minutes").value),
        unlimited: state.unlimitedSelected,
        connection_id: state.connectionId,
      },
    });
    activateRoom(result.room, { statusMessage: state.unlimitedSelected ? "Your open-ended room is ready." : "Your synchronized focus room is ready." });
    byId("focus-chat-input").focus();
  } catch (error) {
    setStatus(error.message || "Could not create this focus room.", "error");
  } finally {
    button.disabled = false;
  }
});

byId("focus-join-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!guardEntitlement("focus_rooms")) return;
  const button = event.currentTarget.querySelector("[type='submit']");
  button.disabled = true;
  setStatus("Looking for that private room…", "loading");
  try {
    const result = await apiRequest("/api/play/focus-rooms/join", {
      method: "POST", auth: true,
      body: { code: byId("focus-room-code").value.trim(), connection_id: state.connectionId },
    });
    activateRoom(result.room, { statusMessage: "You joined the live room and its shared conversation." });
    byId("focus-chat-input").focus();
  } catch (error) {
    setStatus(error.message || "Could not join that focus room.", "error");
  } finally {
    button.disabled = false;
  }
});

byId("focus-chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.activeRoom || state.activeRoom.status !== "ACTIVE" || state.sending || !guardEntitlement("focus_rooms")) return;
  const input = byId("focus-chat-input");
  const message = input.value.trim();
  if (!message) return;
  state.sending = true;
  setComposerEnded(false);
  hideMentionMenu();
  try {
    const result = await apiRequest(`/api/play/focus-rooms/${encodeURIComponent(state.activeRoom.code)}/messages`, {
      method: "POST", auth: true, body: { message },
    });
    input.value = "";
    renderRoom(result.room, { statusMessage: /(?:^|\s)@emora\b/i.test(message) ? "Emora was invited into the shared conversation." : "Your message is live for everyone in the room." });
  } catch (error) {
    if (error.status === 410) {
      state.activeRoom.status = "ENDED";
      renderRoom(state.activeRoom);
    } else setStatus(error.message || "Could not send this room message.", "error");
  } finally {
    state.sending = false;
    setComposerEnded(state.activeRoom?.status === "ENDED");
    input.focus();
  }
});

function mentionMatch() {
  const input = byId("focus-chat-input");
  return input.value.slice(0, input.selectionStart).match(/(?:^|\s)@([a-z]*)$/i);
}

function showMentionMenu() {
  state.mentionOpen = true;
  byId("focus-mention-menu").hidden = false;
  byId("focus-chat-input").setAttribute("aria-expanded", "true");
}

function updateMentionMenu() {
  const match = mentionMatch();
  if (match && "emora".startsWith(match[1].toLowerCase())) showMentionMenu();
  else hideMentionMenu();
}

function insertEmoraMention() {
  const input = byId("focus-chat-input");
  const before = input.value.slice(0, input.selectionStart);
  const match = before.match(/(?:^|\s)@[a-z]*$/i);
  if (!match) return;
  const replacement = `${match[0].startsWith(" ") ? " " : ""}@emora `;
  input.value = before.slice(0, match.index) + replacement + input.value.slice(input.selectionEnd);
  const nextCursor = match.index + replacement.length;
  input.setSelectionRange(nextCursor, nextCursor);
  hideMentionMenu();
  input.focus();
}

byId("focus-chat-input").addEventListener("input", updateMentionMenu);
byId("focus-chat-input").addEventListener("keydown", (event) => {
  if (state.mentionOpen && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); return; }
  if (state.mentionOpen && event.key === "Escape") { event.preventDefault(); hideMentionMenu(); return; }
  if (state.mentionOpen && (event.key === "Enter" || event.key === "Tab")) { event.preventDefault(); insertEmoraMention(); return; }
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); byId("focus-chat-form").requestSubmit(); }
});
byId("focus-mention-menu").querySelector("button").addEventListener("click", insertEmoraMention);

byId("focus-copy-code").addEventListener("click", async () => {
  const button = byId("focus-copy-code");
  try {
    const copied = await copyText(byId("focus-live-code").textContent);
    button.textContent = copied ? "Copied" : "Copy failed";
  } catch { button.textContent = "Copy failed"; }
  window.setTimeout(() => { button.textContent = "Copy code"; }, 1800);
});

byId("focus-end-session").addEventListener("click", () => byId("focus-end-dialog").showModal());
byId("focus-reflect-session").addEventListener("click", async (event) => {
  if (!state.activeRoom || !guardEntitlement("session_reflection")) return;
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Emora is reflecting…";
  try {
    const result = await apiRequest(`/api/play/focus-rooms/${encodeURIComponent(state.activeRoom.code)}/reflection`, { method: "POST", auth: true });
    renderRoom(result.room, { statusMessage: "The optional room reflection is ready. It uses only this shared transcript." });
  } catch (error) {
    setStatus(error.message || "Could not reflect this session right now.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "Reflect before closing";
  }
});
byId("focus-confirm-end").addEventListener("click", async (event) => {
  event.preventDefault();
  const button = event.currentTarget;
  if (!state.activeRoom?.isHost || state.activeRoom.status !== "ACTIVE") return;
  button.disabled = true;
  try {
    const result = await apiRequest(`/api/play/focus-rooms/${encodeURIComponent(state.activeRoom.code)}/end`, { method: "POST", auth: true });
    byId("focus-end-dialog").close();
    renderRoom(result.room);
  } catch (error) {
    setStatus(error.message || "Could not end this session.", "error");
  } finally { button.disabled = false; }
});

initChrome();
const session = await ensureSession({ redirectTo: "/login" });
if (session) {
  renderAccess();
  await recoverCurrentRoom();
}

window.addEventListener("pagehide", () => {
  stopRealtime();
}, { once: true });
