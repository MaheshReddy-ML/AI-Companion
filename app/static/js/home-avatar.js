import { createEmoraAvatarStage } from "./emora-avatar-stage.js?v=20260715-full-body-framing";

const stageElement = document.getElementById("landing-vrm-stage");

if (stageElement && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const stage = createEmoraAvatarStage(stageElement, {
    greetingAction: false,
    initialBlinkDelayMs: 3.8,
    entryDelayMs: 280,
  });
  stage.setCharacter({ id: "landing-yuna", model: "/static/images/companions/female-yuna.vrm" }).catch(() => {
    stageElement.classList.add("is-unavailable");
  });
}
