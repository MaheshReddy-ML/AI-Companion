const path = window.location.pathname.replace(/\/$/, "") || "/";
// The native dialog supplies focus containment, Escape and focus restoration.
const navigationDialog = document.querySelector("#mobile-navigation-dialog");
const moreButton = document.querySelector("#mobile-more");
if (navigationDialog && moreButton) {
  moreButton.addEventListener("click", () => {
    navigationDialog.showModal();
    moreButton.setAttribute("aria-expanded", "true");
  });
  navigationDialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const items = [...navigationDialog.querySelectorAll("button, a[href]")];
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  navigationDialog.addEventListener("close", () => moreButton.setAttribute("aria-expanded", "false"));
  navigationDialog.addEventListener("click", (event) => {
    if (event.target !== navigationDialog) return;
    const box = navigationDialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) navigationDialog.close();
  });
  const mobileBreakpoint = matchMedia("(max-width: 900px)");
  mobileBreakpoint.addEventListener("change", () => { if (!mobileBreakpoint.matches && navigationDialog.open) navigationDialog.close(); });
  document.querySelectorAll(".mobile-primary-nav a, .navigation-sheet a, .shared-workspace-rail nav a").forEach((link) => {
    if (new URL(link.href).pathname !== path) return;
    link.setAttribute("aria-current", "page");
    link.classList.add("active");
    if (link.closest(".navigation-sheet")) moreButton.classList.add("active");
  });
}
