import { initChrome } from "./common.js";
import { createCinematicRoom } from "./cinematic-room.js";

initChrome();

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const site = document.querySelector("[data-cinematic-site]");
const mount = document.querySelector("[data-cinematic-mount]");
const loading = document.querySelector("[data-cinematic-loading]");
const menuButton = document.querySelector("[data-cinematic-menu]");
const nav = document.querySelector(".cinematic-nav");
let room = null;

function revealScene() {
  site?.classList.add("is-ready");
  if (loading) loading.hidden = true;
}

if (mount) {
  const begin = () => {
    try {
      room = createCinematicRoom(mount, {
        imageUrl: "/static/images/emora-night-room-v1.webp",
        reducedMotion: reduceMotion,
        onReady: revealScene,
      });
    } catch (error) {
      console.warn("Cinematic room fell back to its still composition.", error);
      site?.classList.add("scene-fallback");
      revealScene();
    }
  };

  if ("requestIdleCallback" in window) window.requestIdleCallback(begin, { timeout: 700 });
  else window.setTimeout(begin, 80);
}

window.setTimeout(revealScene, 2400);

menuButton?.addEventListener("click", () => {
  const open = nav?.classList.toggle("menu-open") ?? false;
  menuButton.setAttribute("aria-expanded", String(open));
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("menu-open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

if (!reduceMotion) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.16 });
  document.querySelectorAll("[data-cinematic-reveal]").forEach((section) => observer.observe(section));
} else {
  document.querySelectorAll("[data-cinematic-reveal]").forEach((section) => section.classList.add("is-visible"));
}

window.addEventListener("pagehide", () => room?.dispose(), { once: true });
