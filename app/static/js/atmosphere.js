function localPeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

function renderAtmosphere() {
  const period = localPeriod();
  document.querySelectorAll(".emora-live-stage, [data-atmosphere-scene]").forEach((scene) => {
    scene.dataset.weather = "clear";
    scene.dataset.period = period;
  });
  document.querySelectorAll("[data-atmosphere-title]").forEach((element) => { element.textContent = "A scene for your time"; });
  document.querySelectorAll("[data-atmosphere-detail]").forEach((element) => { element.textContent = `${period[0].toUpperCase() + period.slice(1)} light · local time`; });
  document.querySelectorAll("[data-atmosphere-icon]").forEach((element) => { element.textContent = period === "night" ? "☾" : "☀"; });
}
// Retain compatibility with the separately maintained room template.
document.querySelectorAll("[data-atmosphere-location]").forEach((button) => button.remove());
renderAtmosphere();
const atmosphereTimer = window.setInterval(renderAtmosphere, 5 * 60 * 1000);
window.addEventListener("pagehide", () => clearInterval(atmosphereTimer), { once: true });
window.addEventListener("pageshow", renderAtmosphere);
