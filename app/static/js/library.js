import { ensureSession, initChrome } from "./common.js";
const input = document.getElementById("help-search");
input?.addEventListener("input", () => { const term = input.value.trim().toLowerCase(); document.querySelectorAll("#help-cards article").forEach((card) => { card.hidden = Boolean(term) && !card.textContent.toLowerCase().includes(term); }); });
initChrome(); ensureSession({ redirectTo: "/login" });
