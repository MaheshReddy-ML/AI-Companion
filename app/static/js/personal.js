import { apiRequest, ensureSession, escapeHtml, getStoredUser, initChrome, showStatus } from "./common.js";

const page = window.location.pathname;
const isJournal = page === "/journal";
const list = document.getElementById(isJournal ? "journal-list" : "goal-list");
const status = document.getElementById(isJournal ? "journal-status" : "goal-status");
let journalEntries = [];
let editingJournalId = null;
let draftTimer = null;
let journalDirty = false;

function journalDraftKey() {
  return `emora:journal-draft:${getStoredUser()?._id || getStoredUser()?.email || "signed-in"}`;
}

function setJournalEditor(entry = null) {
  if (!isJournal) return;
  editingJournalId = entry?.id || null;
  const isEditing = Boolean(editingJournalId);
  document.getElementById("journal-title").value = entry?.title || "";
  document.getElementById("journal-content").value = entry?.content || "";
  document.getElementById("journal-mood").value = entry?.mood || "reflective";
  document.getElementById("journal-editor-mode").textContent = isEditing ? "EDIT REFLECTION" : "NEW REFLECTION";
  document.getElementById("journal-submit").textContent = isEditing ? "Save changes" : "Save reflection";
  document.getElementById("journal-cancel-edit").hidden = !isEditing;
  journalDirty = false;
}

function saveJournalDraft() {
  if (!isJournal || editingJournalId) return;
  const draft = {
    title: document.getElementById("journal-title").value,
    content: document.getElementById("journal-content").value,
    mood: document.getElementById("journal-mood").value,
  };
  if (draft.title.trim() || draft.content.trim()) {
    localStorage.setItem(journalDraftKey(), JSON.stringify(draft));
    document.getElementById("journal-draft-status").textContent = "Draft saved on this device";
  } else {
    localStorage.removeItem(journalDraftKey());
    document.getElementById("journal-draft-status").textContent = "Private by default";
  }
}

function renderJournal(entries) {
  journalEntries = entries;
  list.innerHTML = entries.map((item) => `
    <article class="personal-item">
      <div><span class="entry-mood">${escapeHtml(item.mood)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content)}</p></div>
      <div class="personal-actions"><button data-edit="${item.id}" class="btn btn-outline btn-sm">Edit</button><button data-delete="${item.id}" class="btn btn-ghost btn-sm">Delete</button></div>
    </article>
  `).join("") || '<p class="muted">Your saved reflections will appear here.</p>';
}

function renderGoals(goals) {
  list.innerHTML = goals.map((item) => `
    <article class="personal-item ${item.completed ? "done" : ""} ${item.isTinyThing ? "tiny-thing" : ""}">
      <div>${item.isTinyThing ? '<span class="entry-mood">TODAY’S TINY THING</span>' : ""}<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.note || "A meaningful next step.")}</p></div>
      <div class="personal-actions">
        ${!item.completed ? `<button data-tiny="${item.id}" class="btn btn-ghost btn-sm" ${item.isTinyThing ? "disabled" : ""}>${item.isTinyThing ? "In view today" : "Make Tiny Thing"}</button>` : ""}
        <button data-${item.completed ? "reopen" : "complete"}="${item.id}" class="btn btn-outline btn-sm">${item.completed ? "Reopen" : "Complete"}</button>
        <button data-delete="${item.id}" class="btn btn-ghost btn-sm">Delete</button>
      </div>
    </article>
  `).join("") || '<p class="muted">Your gentle goals will appear here.</p>';
}

async function load() {
  const data = await apiRequest(isJournal ? "/api/personal/journal" : "/api/personal/goals", { auth: true });
  if (isJournal) renderJournal(data.entries || []);
  else renderGoals(data.goals || []);
}

function consumeConversationRemix() {
  if (!isJournal) return;
  const raw = sessionStorage.getItem("emora:journal-remix");
  if (!raw) return;
  sessionStorage.removeItem("emora:journal-remix");
  try {
    const remix = JSON.parse(raw);
    document.getElementById("journal-title").value = remix.title || "A conversation worth keeping";
    document.getElementById("journal-content").value = remix.content || "";
    saveJournalDraft();
    showStatus(status, "A private draft was carried over from Companion. Review it before saving.", "info");
  } catch {
    // Ignore malformed device-local drafts.
  }
}

document.querySelectorAll("[data-journal-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    const content = document.getElementById("journal-content");
    content.value = `${button.dataset.journalPrompt}\n\n${content.value}`.trimEnd();
    content.focus();
    saveJournalDraft();
  });
});

if (isJournal) {
  ["journal-title", "journal-content", "journal-mood"].forEach((id) => document.getElementById(id)?.addEventListener("input", () => {
    journalDirty = true;
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(saveJournalDraft, 350);
  }));
  document.getElementById("journal-cancel-edit")?.addEventListener("click", () => {
    if (journalDirty && !window.confirm("Discard your unsaved changes to this reflection?")) return;
    setJournalEditor();
  });
  window.addEventListener("beforeunload", (event) => {
    if (!editingJournalId || !journalDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

document.getElementById(isJournal ? "journal-form" : "goal-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const body = isJournal
      ? { title: document.getElementById("journal-title").value || "Untitled reflection", content: document.getElementById("journal-content").value, mood: document.getElementById("journal-mood").value }
      : { title: document.getElementById("goal-title").value, note: document.getElementById("goal-note").value };
    const endpoint = isJournal && editingJournalId ? `/api/personal/journal/${editingJournalId}` : isJournal ? "/api/personal/journal" : "/api/personal/goals";
    const submit = event.target.querySelector("button[type='submit']");
    submit.disabled = true;
    await apiRequest(endpoint, { method: isJournal && editingJournalId ? "PATCH" : "POST", auth: true, body });
    journalDirty = false;
    event.target.reset();
    if (isJournal) {
      localStorage.removeItem(journalDraftKey());
      setJournalEditor();
      document.getElementById("journal-draft-status").textContent = "Private by default";
    }
    showStatus(status, isJournal ? "Reflection saved." : "Goal added.", "success");
    await load();
  } catch (error) {
    showStatus(status, error.message || "Could not save this.");
  } finally {
    event.target.querySelector("button[type='submit']").disabled = false;
  }
});

list?.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete]");
  const completeButton = event.target.closest("[data-complete]");
  const reopenButton = event.target.closest("[data-reopen]");
  const tinyButton = event.target.closest("[data-tiny]");
  const editButton = event.target.closest("[data-edit]");
  if (deleteButton && !window.confirm(`Delete this ${isJournal ? "reflection" : "goal"}? This cannot be undone.`)) return;
  const actionButton = deleteButton || completeButton || reopenButton || tinyButton || editButton;
  if (actionButton) actionButton.disabled = true;
  try {
    if (editButton) {
      setJournalEditor(journalEntries.find((item) => item.id === editButton.dataset.edit));
      document.querySelector(".journal-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (deleteButton) {
      await apiRequest(`${isJournal ? "/api/personal/journal" : "/api/personal/goals"}/${deleteButton.dataset.delete}`, { method: "DELETE", auth: true });
      if (isJournal && editingJournalId === deleteButton.dataset.delete) setJournalEditor();
    }
    if (completeButton) await apiRequest(`/api/personal/goals/${completeButton.dataset.complete}/complete`, { method: "PATCH", auth: true });
    if (reopenButton) await apiRequest(`/api/personal/goals/${reopenButton.dataset.reopen}/reopen`, { method: "PATCH", auth: true });
    if (tinyButton) {
      await apiRequest(`/api/personal/goals/${tinyButton.dataset.tiny}/tiny-thing`, { method: "PATCH", auth: true });
      showStatus(status, "Your One Tiny Thing is now in view on Overview.", "success");
    }
    await load();
  } catch (error) {
    showStatus(status, error.message || "Could not update this item.");
  } finally {
    if (actionButton) actionButton.disabled = false;
  }
});

initChrome();
if (await ensureSession({ redirectTo: "/login" })) {
  if (isJournal && !sessionStorage.getItem("emora:journal-remix")) {
    try {
      const draft = JSON.parse(localStorage.getItem(journalDraftKey()) || "null");
      if (draft) {
        setJournalEditor(draft);
        document.getElementById("journal-draft-status").textContent = "Restored device draft";
      }
    } catch { localStorage.removeItem(journalDraftKey()); }
  }
  consumeConversationRemix();
  load();
}
