const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealTargets = [".section", ".metric-card", ".feat-card", ".card", ".settings-section", ".post-card", ".play-panel", ".quest-grid .settings-row", ".personal-item", ".library-cards article"];

if (!reduceMotion) {
  const elements = document.querySelectorAll(revealTargets.join(","));
  elements.forEach((element, index) => {
    element.dataset.reveal = "";
    element.style.setProperty("--reveal-delay", `${Math.min(index % 6, 5) * 55}ms`);
  });
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.dataset.reveal = "visible";
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  elements.forEach((element) => observer.observe(element));
}

document.documentElement.classList.add("motion-ready");

// Keep legacy sidebar templates in sync while pages are progressively migrated.
const normalizedPath = window.location.pathname.replace(/\/$/, "") || "/";
document.querySelectorAll(".sidebar .nav-item[href]").forEach((link) => {
  const linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/$/, "") || "/";
  link.classList.toggle("active", linkPath === normalizedPath);
  if (linkPath === normalizedPath) link.setAttribute("aria-current", "page");
});
