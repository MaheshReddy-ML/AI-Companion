import { apiRequest, ensureSession, escapeHtml, getToken, initChrome } from "./common.js";
const input = document.getElementById("help-search");
const searchState = document.getElementById("help-search-state");
const emptyState = document.getElementById("help-search-empty");
const clearButton = document.getElementById("help-search-clear");

function filterHelpTopics() {
  const term = input?.value.trim().toLowerCase() || "";
  const cards = [...document.querySelectorAll("#help-cards article")];
  let visible = 0;
  cards.forEach((card) => {
    const matches = !term || card.textContent.toLowerCase().includes(term);
    card.hidden = !matches;
    if (matches) visible += 1;
  });
  if (searchState) searchState.textContent = term ? `${visible} help topic${visible === 1 ? "" : "s"} matched “${input.value.trim()}”` : "Showing all help topics";
  if (emptyState) emptyState.hidden = visible > 0;
}

input?.addEventListener("input", filterHelpTopics);
input?.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && input.value) {
    input.value = "";
    filterHelpTopics();
  }
});
clearButton?.addEventListener("click", () => {
  input.value = "";
  filterHelpTopics();
  input.focus();
});
const shelfList = document.getElementById("research-shelf-list");
const shelfExport = document.getElementById("research-shelf-export");

async function loadShelf() {
  if (!shelfList) return;
  const response = await apiRequest("/api/workspace/research-shelf", { auth: true });
  shelfList.innerHTML = response.items.length ? response.items.map((item) => `<article data-shelf-item="${escapeHtml(item.id)}"><div><span>${escapeHtml(item.domain)}</span><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"><h3>${escapeHtml(item.title)}</h3></a><p>${escapeHtml(item.note || "No private note yet.")}</p><small>${item.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ") || "Untagged"} · ${escapeHtml(item.availability)}</small></div><button type="button" data-edit-shelf="${escapeHtml(item.id)}" data-note="${escapeHtml(item.note)}" data-tags="${escapeHtml(item.tags.join(", "))}">Edit</button><button type="button" data-delete-shelf="${escapeHtml(item.id)}">Remove</button></article>`).join("") : '<div class="research-shelf-empty"><strong>Your shelf is ready.</strong><p>When Emora searches the web, use Save beside a source to keep it here.</p><a href="/chat?new=1">Start a conversation</a></div>';
}

shelfList?.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-shelf]");
  const remove = event.target.closest("[data-delete-shelf]");
  try {
    if (edit) {
      const note = window.prompt("Private note (up to 500 characters)", edit.dataset.note || ""); if (note === null) return;
      const tags = window.prompt("Tags separated by commas", edit.dataset.tags || ""); if (tags === null) return;
      await apiRequest(`/api/workspace/research-shelf/${edit.dataset.editShelf}`, { method: "PATCH", auth: true, body: { note, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) } }); await loadShelf();
    } else if (remove && window.confirm("Remove this source from your shelf?")) { await apiRequest(`/api/workspace/research-shelf/${remove.dataset.deleteShelf}`, { method: "DELETE", auth: true }); await loadShelf(); }
  } catch (error) { shelfList.insertAdjacentHTML("afterbegin", `<p class="status error">${escapeHtml(error.message || "Could not update the shelf.")}</p>`); }
});
shelfExport?.addEventListener("click", (event) => { event.preventDefault(); fetch(shelfExport.href, { headers: { Authorization: `Bearer ${getToken()}` } }).then(async (response) => { if (!response.ok) throw new Error(); const link = document.createElement("a"); link.href = URL.createObjectURL(await response.blob()); link.download = "emora-research-shelf.json"; link.click(); URL.revokeObjectURL(link.href); }).catch(() => alert("Could not export your shelf.")); });

initChrome();
(async () => { const session = await ensureSession({ redirectTo: "/login" }); if (session?.verified) await loadShelf(); })();
