import { STORAGE_KEYS, getToken, initChrome, redirect } from "./common.js";

initChrome();

document.querySelectorAll("[data-character-launch]").forEach((button) => {
  button.addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEYS.starterCharacter, button.dataset.characterLaunch);
    redirect(getToken() ? "/dashboard" : "/login");
  });
});
