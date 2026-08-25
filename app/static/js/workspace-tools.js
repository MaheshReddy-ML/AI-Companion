import { apiRequest, escapeHtml, getStoredUser, getToken, toggleTheme } from "./common.js";

const dialog = document.getElementById("workspace-command-dialog");
const trigger = document.getElementById("workspace-command-trigger");
const input = document.getElementById("workspace-command-input");
const status = document.getElementById("workspace-command-status");
const results = document.getElementById("workspace-command-results");
const actions = document.getElementById("workspace-command-actions");
const draftList = document.getElementById("workspace-draft-list");
const clearDrafts = document.getElementById("workspace-clear-drafts");
const shortcutModifier = document.querySelector(".workspace-command-modifier");
const DRAFT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
let searchTimer = null;

if (shortcutModifier) shortcutModifier.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

function applyAccessibility(preferences = {}) {
  const root = document.documentElement;
  const body = document.body;
  body.dataset.emoraTextSize = preferences.textSize || "system";
  body.dataset.emoraMotion = preferences.motion || "system";
  body.dataset.emoraContrast = preferences.contrast || "system";
  body.dataset.emoraCalmEffects = String(Boolean(preferences.calmEffects));
  root.dataset.emoraAccessibilityReady = "true";
}

async function initializeAccountTools() {
  if (!getToken()) return;
  const results = await Promise.allSettled([
    apiRequest("/api/workspace/sessions/register", { method: "POST", auth: true }),
    apiRequest("/api/personal/preferences", { auth: true }).then((data) => applyAccessibility(data.preferences || {})),
    apiRequest("/api/workspace/schedule/due", { auth: true }),
  ]);
  const due = results[2]?.status === "fulfilled" ? results[2].value : null;
  if (due?.due) {
    const nudge = document.createElement("aside");
    nudge.className = "workspace-checkin-nudge";
    nudge.setAttribute("aria-label", "Scheduled check-in");
    nudge.innerHTML = `<div><span>GENTLE CHECK-IN</span><strong>${escapeHtml(due.message)}</strong></div><a href="/chat?new=1&prompt=${encodeURIComponent("I'd like a gentle check-in.")}">Open Emora</a><button type="button" aria-label="Dismiss check-in">×</button>`;
    nudge.querySelector("button").addEventListener("click", async () => { await apiRequest("/api/workspace/schedule/ack", { method: "POST", auth: true }).catch(() => null); nudge.remove(); });
    document.body.append(nudge);
  }
}

function parseDrafts() {
  const drafts = [];
  const now = Date.now();
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key || (!key.startsWith("ai-companion:dashboard-drafts:") && !key.startsWith("emora:journal-draft:"))) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (key.startsWith("emora:journal-draft:") && value) {
        const savedAt = Number(value.savedAt || now);
        if (now - savedAt > DRAFT_MAX_AGE) { localStorage.removeItem(key); continue; }
        if (String(value.title || value.content || "").trim()) drafts.push({ key, id: "journal", type: "Journal", title: value.title || "Untitled reflection", preview: value.content || "Journal draft", savedAt, value });
      } else if (value && typeof value === "object") {
        Object.entries(value).forEach(([id, raw]) => {
          const normalized = typeof raw === "string" ? { text: raw, savedAt: now } : raw;
          const savedAt = Number(normalized?.savedAt || now);
          if (!normalized?.text?.trim() || now - savedAt > DRAFT_MAX_AGE) return;
          drafts.push({ key, id, type: "Chat", title: "Unsent conversation", preview: normalized.text, savedAt, value: normalized });
        });
      }
    } catch { localStorage.removeItem(key); }
  }
  return drafts.sort((a, b) => b.savedAt - a.savedAt);
}

function discardDraft(draft) {
  if (draft.type === "Journal") localStorage.removeItem(draft.key);
  else {
    const stored = JSON.parse(localStorage.getItem(draft.key) || "{}");
    delete stored[draft.id];
    if (Object.keys(stored).length) localStorage.setItem(draft.key, JSON.stringify(stored));
    else localStorage.removeItem(draft.key);
  }
  renderDrafts();
}

function restoreDraft(draft) {
  sessionStorage.setItem("emora:restore-device-draft", JSON.stringify({ type: draft.type.toLowerCase(), id: draft.id, ...draft.value }));
  window.location.assign(draft.type === "Journal" ? "/journal?restore=1" : `/chat?new=1&restore=1`);
}

function renderDrafts() {
  if (!draftList) return;
  const drafts = parseDrafts();
  clearDrafts.disabled = !drafts.length;
  draftList.innerHTML = drafts.length ? drafts.map((draft, index) => `<article><div><strong>${escapeHtml(draft.type)} · ${escapeHtml(draft.title)}</strong><p>${escapeHtml(draft.preview.slice(0, 120))}</p><time>${new Date(draft.savedAt).toLocaleString()}</time></div><button type="button" data-draft-restore="${index}">Restore</button><button type="button" data-draft-discard="${index}">Discard</button></article>`).join("") : '<p class="workspace-draft-empty">No recoverable drafts on this device.</p>';
  draftList.dataset.drafts = JSON.stringify(drafts.map(({ key, id, type, title, preview, savedAt, value }) => ({ key, id, type, title, preview, savedAt, value })));
}

function openPalette() {
  renderDrafts();
  if (typeof dialog?.showModal === "function") dialog.showModal();
  else dialog?.setAttribute("open", "");
  window.requestAnimationFrame(() => input?.focus());
}

function closePalette() { dialog?.close?.(); }

function renderSearch(items = []) {
  actions.hidden = Boolean(input.value.trim());
  results.innerHTML = items.map((item) => `<a href="${escapeHtml(item.path)}"><span>${escapeHtml(item.type)}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.excerpt || "Open item")}</p><time>${item.date ? new Date(item.date).toLocaleDateString() : ""}</time></a>`).join("");
  results.hidden = !input.value.trim();
}

async function searchWorkspace(query) {
  if (query.length < 2) { renderSearch([]); status.textContent = query ? "Type at least two characters." : "Your search stays inside your account."; return; }
  status.textContent = "Searching your private space…";
  try {
    const data = await apiRequest(`/api/workspace/search?q=${encodeURIComponent(query)}`, { auth: true, cache: "no-store" });
    renderSearch(data.results || []);
    status.textContent = data.results?.length ? `${data.results.length} real result${data.results.length === 1 ? "" : "s"}` : "Nothing matched. No results were invented.";
  } catch (error) { status.textContent = error.message || "Search is unavailable right now."; renderSearch([]); }
}

trigger?.addEventListener("click", openPalette);
dialog?.querySelector("[data-command-close]")?.addEventListener("click", closePalette);
dialog?.addEventListener("click", (event) => { if (event.target === dialog) closePalette(); });
window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); dialog?.open ? closePalette() : openPalette(); }
});
input?.addEventListener("input", () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => searchWorkspace(input.value.trim()), 220); });
actions?.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.commandPath) window.location.assign(button.dataset.commandPath);
  if (button.dataset.commandAction === "theme") { toggleTheme(); closePalette(); }
});
draftList?.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const drafts = JSON.parse(draftList.dataset.drafts || "[]");
  const index = Number(button.dataset.draftRestore ?? button.dataset.draftDiscard);
  const draft = drafts[index];
  if (!draft) return;
  if (button.dataset.draftRestore !== undefined) restoreDraft(draft); else discardDraft(draft);
});
clearDrafts?.addEventListener("click", () => { parseDrafts().forEach(discardDraft); renderDrafts(); });

applyAccessibility({});
void initializeAccountTools();
