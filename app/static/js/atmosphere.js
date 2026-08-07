const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const WEATHER_CACHE_KEY = "emora:atmosphere:weather";
const CACHE_MAX_AGE = 30 * 60 * 1000;

const WEATHER = {
  0: { type: "clear", label: "Clear", icon: "☀" },
  1: { type: "partly-cloudy", label: "Mostly clear", icon: "◐" },
  2: { type: "partly-cloudy", label: "Partly cloudy", icon: "☁" },
  3: { type: "cloudy", label: "Overcast", icon: "☁" },
  45: { type: "fog", label: "Misty", icon: "〰" },
  48: { type: "fog", label: "Rime fog", icon: "〰" },
  51: { type: "drizzle", label: "Light drizzle", icon: "☂" },
  53: { type: "drizzle", label: "Drizzle", icon: "☂" },
  55: { type: "drizzle", label: "Dense drizzle", icon: "☂" },
  61: { type: "rain", label: "Light rain", icon: "☂" },
  63: { type: "rain", label: "Rain", icon: "☂" },
  65: { type: "rain", label: "Heavy rain", icon: "☂" },
  71: { type: "snow", label: "Light snow", icon: "✦" },
  73: { type: "snow", label: "Snow", icon: "✦" },
  75: { type: "snow", label: "Heavy snow", icon: "✦" },
  80: { type: "rain", label: "Rain showers", icon: "☂" },
  81: { type: "rain", label: "Rain showers", icon: "☂" },
  82: { type: "rain", label: "Heavy showers", icon: "☂" },
  95: { type: "storm", label: "Thunderstorm", icon: "ϟ" },
  96: { type: "storm", label: "Storm with hail", icon: "ϟ" },
  99: { type: "storm", label: "Storm with hail", icon: "ϟ" },
};

function localPeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

function readCachedWeather() {
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
    return cached && Date.now() - cached.savedAt < CACHE_MAX_AGE ? cached : null;
  } catch {
    return null;
  }
}

function writeCachedWeather(weather) {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ...weather, savedAt: Date.now() }));
  } catch {
    // Atmosphere remains fully functional when storage is unavailable.
  }
}

function getWeatherForPosition({ latitude, longitude }) {
  const url = new URL(WEATHER_ENDPOINT);
  url.search = new URLSearchParams({ latitude, longitude, current: "temperature_2m,weather_code,is_day", timezone: "auto" });
  return fetch(url, { headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) throw new Error("Weather service unavailable");
      return response.json();
    })
    .then((data) => ({
      code: data.current?.weather_code,
      temperature: Math.round(data.current?.temperature_2m),
      isDay: Boolean(data.current?.is_day),
      timezone: data.timezone,
    }));
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 30 * 60 * 1000 });
  });
}

function renderAtmosphere(weather = null) {
  const period = weather?.isDay === false ? "night" : localPeriod();
  const condition = WEATHER[weather?.code] || { type: "clear", label: period === "night" ? "Clear night" : "Clear", icon: period === "night" ? "☾" : "☀" };
  const detail = weather ? `${condition.label} · ${weather.temperature}°C` : `${period === "night" ? "Night" : period[0].toUpperCase() + period.slice(1)} light · local time`;
  const title = weather ? `${condition.label} outside` : "A scene for your time";

  document.querySelectorAll(".emora-live-stage, [data-atmosphere-scene]").forEach((scene) => {
    scene.dataset.weather = condition.type;
    scene.dataset.period = period;
  });
  document.querySelectorAll("[data-atmosphere-title]").forEach((element) => { element.textContent = title; });
  document.querySelectorAll("[data-atmosphere-detail]").forEach((element) => { element.textContent = detail; });
  document.querySelectorAll("[data-atmosphere-icon]").forEach((element) => { element.textContent = condition.icon; });
}

async function requestLocalAtmosphere(button) {
  const buttons = document.querySelectorAll("[data-atmosphere-location]");
  buttons.forEach((item) => { item.disabled = true; item.textContent = "Finding you…"; });
  try {
    const position = await getPosition();
    const weather = await getWeatherForPosition(position.coords);
    writeCachedWeather(weather);
    renderAtmosphere(weather);
    buttons.forEach((item) => { item.textContent = "Weather synced"; });
  } catch (error) {
    buttons.forEach((item) => { item.textContent = "Location unavailable"; });
    window.setTimeout(() => buttons.forEach((item) => { item.disabled = false; item.textContent = "Use location"; }), 2800);
  }
}

function initialiseAtmosphere() {
  if (!document.querySelector(".emora-live-stage, [data-atmosphere-scene]")) return;
  renderAtmosphere(readCachedWeather());
  document.querySelectorAll("[data-atmosphere-location]").forEach((button) => {
    button.addEventListener("click", () => requestLocalAtmosphere(button));
  });
  window.setInterval(() => renderAtmosphere(readCachedWeather()), 5 * 60 * 1000);
}

initialiseAtmosphere();
