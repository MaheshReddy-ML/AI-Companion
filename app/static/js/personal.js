import { apiRequest, ensureSession, escapeHtml, getStoredUser, initChrome, showStatus } from "./common.js";

const page = window.location.pathname;
const isJournal = page === "/journal";
const list = document.getElementById(isJournal ? "journal-list" : "goal-list");
const status = document.getElementById(isJournal ? "journal-status" : "goal-status");
let journalEntries = [];
let goalEntries = [];
let editingJournalId = null;
let editingGoalId = null;
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

function setGoalEditor(goal = null, { smaller = false } = {}) {
  if (isJournal) return;
  editingGoalId = goal?.id || null;
  document.getElementById("goal-title").value = goal?.title || "";
  document.getElementById("goal-note").value = goal?.note || "";
  document.getElementById("goal-submit").textContent = editingGoalId ? (smaller ? "Save smaller step" : "Save revision") : "Add to my path";
  document.getElementById("goal-cancel-edit").hidden = !editingGoalId;
  document.getElementById("goal-editor-status").textContent = smaller ? "Rewrite this as the smallest useful next step" : editingGoalId ? "Revise without losing its history" : "Progress is personal";
  document.getElementById("goal-title").focus({ preventScroll: true });
}

function saveJournalDraft() {
  if (!isJournal || editingJournalId) return;
  const draft = {
    title: document.getElementById("journal-title").value,
    content: document.getElementById("journal-content").value,
    mood: document.getElementById("journal-mood").value,
    savedAt: Date.now(),
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
    <article class="personal-item" data-record-id="${item.id}">
      <div><span class="entry-mood">${escapeHtml(item.mood)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content)}</p></div>
      <div class="personal-actions"><button data-edit="${item.id}" class="btn btn-outline btn-sm">Edit</button><button data-delete="${item.id}" class="btn btn-ghost btn-sm">Delete</button></div>
    </article>
  `).join("") || '<div class="personal-empty"><span>▣</span><h3>Your first page is open.</h3><p>Use a prompt or begin with one sentence. Nothing is public and there is no perfect way to start.</p><button type="button" data-empty-focus="journal-content">Begin a reflection</button></div>';
}

function renderGoals(goals) {
  goalEntries = goals;
  list.innerHTML = goals.map((item) => `
    <article class="personal-item ${item.completed ? "done" : ""} ${item.isTinyThing ? "tiny-thing" : ""}" data-goal-status="${escapeHtml(item.status || (item.completed ? "completed" : "active"))}" data-record-id="${item.id}">
      <div>${item.isTinyThing ? '<span class="entry-mood">TODAY’S TINY THING</span>' : ""}${item.status && item.status !== "active" ? `<span class="entry-mood">${escapeHtml(item.status.toUpperCase())}</span>` : ""}<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.note || "A meaningful next step.")}</p></div>
      <div class="personal-actions">
        ${(!item.status || item.status === "active") && !item.completed ? `<button data-tiny="${item.id}" class="btn btn-ghost btn-sm" ${item.isTinyThing ? "disabled" : ""}>${item.isTinyThing ? "In view today" : "Make Tiny Thing"}</button><button data-smaller="${item.id}" class="btn btn-ghost btn-sm">Smaller next step</button><button data-edit-goal="${item.id}" class="btn btn-ghost btn-sm">Revise</button><button data-pause="${item.id}" class="btn btn-ghost btn-sm">Pause</button><button data-complete="${item.id}" class="btn btn-outline btn-sm">Complete</button>` : `<button data-reopen="${item.id}" class="btn btn-outline btn-sm">${item.status === "paused" ? "Resume" : "Reopen"}</button>`}
        ${item.status !== "archived" ? `<button data-archive="${item.id}" class="btn btn-ghost btn-sm">Archive</button>` : ""}
        <button data-delete="${item.id}" class="btn btn-ghost btn-sm">Delete</button>
      </div>
    </article>
  `).join("") || '<div class="personal-empty"><span>◎</span><h3>No path needs forcing.</h3><p>Add one direction that matters, then make the next step small enough to begin.</p><button type="button" data-empty-focus="goal-title">Add a gentle goal</button></div>';
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
document.getElementById("goal-cancel-edit")?.addEventListener("click", () => setGoalEditor());

document.getElementById(isJournal ? "journal-form" : "goal-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const body = isJournal
      ? { title: document.getElementById("journal-title").value || "Untitled reflection", content: document.getElementById("journal-content").value, mood: document.getElementById("journal-mood").value }
      : { title: document.getElementById("goal-title").value, note: document.getElementById("goal-note").value };
    const endpoint = isJournal && editingJournalId ? `/api/personal/journal/${editingJournalId}` : isJournal ? "/api/personal/journal" : editingGoalId ? `/api/personal/goals/${editingGoalId}` : "/api/personal/goals";
    if (isJournal && editingJournalId) body.expectedVersion = journalEntries.find((entry) => entry.id === editingJournalId)?.version || 1;
    if (!isJournal && editingGoalId) body.expectedVersion = goalEntries.find((entry) => entry.id === editingGoalId)?.version || 1;
    const submit = event.target.querySelector("button[type='submit']");
    submit.disabled = true;
    await apiRequest(endpoint, { method: (isJournal && editingJournalId) || (!isJournal && editingGoalId) ? "PATCH" : "POST", auth: true, body });
    journalDirty = false;
    event.target.reset();
    if (isJournal) {
      localStorage.removeItem(journalDraftKey());
      setJournalEditor();
      document.getElementById("journal-draft-status").textContent = "Private by default";
    }
    else setGoalEditor();
    showStatus(status, isJournal ? "Reflection saved." : "Goal added.", "success");
    await load();
  } catch (error) {
    if (error.status === 409) {
      const current = error.data?.detail?.current;
      const loadServer = window.confirm(`Another device saved a newer version${current?.title ? ` of “${current.title}”` : ""}.\n\nChoose OK to load the server version, or Cancel to keep your unsaved text here so you can compare and copy it.`);
      if (loadServer) await load();
    }
    showStatus(status, error.message || "Could not save this.");
  } finally {
    event.target.querySelector("button[type='submit']").disabled = false;
  }
});

list?.addEventListener("click", async (event) => {
  const emptyFocus = event.target.closest("[data-empty-focus]");
  if (emptyFocus) {
    document.getElementById(emptyFocus.dataset.emptyFocus)?.focus();
    document.querySelector(".journal-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const deleteButton = event.target.closest("[data-delete]");
  const completeButton = event.target.closest("[data-complete]");
  const reopenButton = event.target.closest("[data-reopen]");
  const tinyButton = event.target.closest("[data-tiny]");
  const editButton = event.target.closest("[data-edit]");
  const editGoalButton = event.target.closest("[data-edit-goal]");
  const smallerButton = event.target.closest("[data-smaller]");
  const pauseButton = event.target.closest("[data-pause]");
  const archiveButton = event.target.closest("[data-archive]");
  if (deleteButton && !window.confirm(`Delete this ${isJournal ? "reflection" : "goal"}? This cannot be undone.`)) return;
  const actionButton = deleteButton || completeButton || reopenButton || tinyButton || editButton || editGoalButton || smallerButton || pauseButton || archiveButton;
  if (actionButton) actionButton.disabled = true;
  try {
    if (editButton) {
      setJournalEditor(journalEntries.find((item) => item.id === editButton.dataset.edit));
      document.querySelector(".journal-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (editGoalButton || smallerButton) {
      const id = editGoalButton?.dataset.editGoal || smallerButton?.dataset.smaller;
      setGoalEditor(goalEntries.find((item) => item.id === id), { smaller: Boolean(smallerButton) });
      document.querySelector(".journal-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (deleteButton) {
      await apiRequest(`${isJournal ? "/api/personal/journal" : "/api/personal/goals"}/${deleteButton.dataset.delete}`, { method: "DELETE", auth: true });
      if (isJournal && editingJournalId === deleteButton.dataset.delete) setJournalEditor();
    }
    if (completeButton) await apiRequest(`/api/personal/goals/${completeButton.dataset.complete}/complete?expectedVersion=${goalEntries.find((item) => item.id === completeButton.dataset.complete)?.version || 1}`, { method: "PATCH", auth: true });
    if (reopenButton) await apiRequest(`/api/personal/goals/${reopenButton.dataset.reopen}/reopen?expectedVersion=${goalEntries.find((item) => item.id === reopenButton.dataset.reopen)?.version || 1}`, { method: "PATCH", auth: true });
    if (pauseButton) await apiRequest(`/api/personal/goals/${pauseButton.dataset.pause}/pause?expectedVersion=${goalEntries.find((item) => item.id === pauseButton.dataset.pause)?.version || 1}`, { method: "PATCH", auth: true });
    if (archiveButton) await apiRequest(`/api/personal/goals/${archiveButton.dataset.archive}/archive?expectedVersion=${goalEntries.find((item) => item.id === archiveButton.dataset.archive)?.version || 1}`, { method: "PATCH", auth: true });
    if (tinyButton) {
      await apiRequest(`/api/personal/goals/${tinyButton.dataset.tiny}/tiny-thing?expectedVersion=${goalEntries.find((item) => item.id === tinyButton.dataset.tiny)?.version || 1}`, { method: "PATCH", auth: true });
      showStatus(status, "Your One Tiny Thing is now in view on Overview.", "success");
    }
    await load();
  } catch (error) {
    if (error.status === 409) {
      const current = error.data?.detail?.current;
      window.alert(`Another device changed “${current?.title || "this goal"}”. Its current state is ${current?.completed ? "completed" : "active"}. The latest server version will now be shown.`);
      await load();
    }
    showStatus(status, error.message || "Could not update this item.");
  } finally {
    if (actionButton) actionButton.disabled = false;
  }
});

initChrome();
if (await ensureSession({ redirectTo: "/login" })) {
  if (isJournal && !sessionStorage.getItem("emora:journal-remix")) {
    try {
      const restored = JSON.parse(sessionStorage.getItem("emora:restore-device-draft") || "null");
      const draft = restored?.type === "journal" ? restored : JSON.parse(localStorage.getItem(journalDraftKey()) || "null");
      if (draft) {
        setJournalEditor(draft);
        document.getElementById("journal-draft-status").textContent = "Restored device draft";
      }
      if (restored?.type === "journal") sessionStorage.removeItem("emora:restore-device-draft");
    } catch { localStorage.removeItem(journalDraftKey()); }
  }
  consumeConversationRemix();
  await load();
  const requestedId = new URLSearchParams(window.location.search).get(isJournal ? "entry" : "goal");
  if (requestedId) {
    const record = (isJournal ? journalEntries : goalEntries).find((item) => item.id === requestedId);
    const card = list?.querySelector(`[data-record-id="${CSS.escape(requestedId)}"]`);
    card?.classList.add("personal-item-highlight"); card?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (isJournal && record) setJournalEditor(record);
  }
}
