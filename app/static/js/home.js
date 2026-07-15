import { STORAGE_KEYS, getToken, initChrome, redirect } from "./common.js";

initChrome();

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const heroStage = document.getElementById("landing-world");
const cursorGlow = document.querySelector(".home-cursor-glow");

function resetStageDepth() {
  heroStage?.style.removeProperty("--stage-x");
  heroStage?.style.removeProperty("--stage-y");
}

if (!reduceMotion && heroStage) {
  heroStage.addEventListener("pointermove", (event) => {
    const bounds = heroStage.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    heroStage.style.setProperty("--stage-x", `${y * -3 + 1}deg`);
    heroStage.style.setProperty("--stage-y", `${x * 5 - 3}deg`);
  });
  heroStage.addEventListener("pointerleave", resetStageDepth);
}

if (!reduceMotion && cursorGlow && window.matchMedia("(pointer: fine)").matches) {
  window.addEventListener("pointermove", (event) => {
    cursorGlow.style.left = `${event.clientX}px`;
    cursorGlow.style.top = `${event.clientY}px`;
    cursorGlow.style.opacity = "1";
  }, { passive: true });
  document.addEventListener("mouseleave", () => { cursorGlow.style.opacity = "0"; });
}

if (!reduceMotion) {
  const revealTargets = document.querySelectorAll("[data-home-reveal]");
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.dataset.homeReveal = "visible";
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });
  revealTargets.forEach((target) => revealObserver.observe(target));
}

document.querySelectorAll("[data-character-launch]").forEach((button) => {
  button.addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEYS.starterCharacter, button.dataset.characterLaunch);
    redirect(getToken() ? "/dashboard" : "/login");
  });
});
