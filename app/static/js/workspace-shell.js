import {
  STORAGE_KEYS,
  ensureSession,
  getStoredUser,
  displayNameForUser,
  getInitials,
  initChrome,
  redirect,
  renderUserAvatar,
} from "./common.js";

function getGreeting(name) {
  const hour = new Date().getHours();
  const prefix = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${prefix}, ${name}`;
}

function fillUserChrome() {
  const user = getStoredUser();
  const name = displayNameForUser(user);
  const email = user?.email || "Signed in workspace";
  const initials = getInitials(name);

  document.querySelectorAll("[data-session-user-name]").forEach((element) => {
    element.textContent = name;
  });

  document.querySelectorAll("[data-session-user-email]").forEach((element) => {
    element.textContent = email;
  });

  document.querySelectorAll("[data-session-user-initial]").forEach((element) => {
    element.textContent = initials;
  });

  document.querySelectorAll("[data-session-greeting]").forEach((element) => {
    element.textContent = getGreeting(name);
  });

  document.querySelectorAll("[data-session-avatar]").forEach((element) => {
    renderUserAvatar(element, user, name);
  });
}

function populateInsights() {
  const timeline = document.getElementById("timeline-chart");
  if (timeline) {
    const values = [34, 46, 39, 55, 62, 58, 70, 64, 49, 57, 61, 68];
    const labels = values.map((_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (values.length - index - 1));
      return date.toLocaleDateString([], index === 0 ? { month: "short", day: "numeric" } : { day: "numeric" });
    });
    const colors = [
      "rgba(212,124,124,0.65)",
      "rgba(107,143,212,0.75)",
      "rgba(78,201,184,0.75)",
      "rgba(95,201,143,0.75)",
    ];

    timeline.innerHTML = `
      ${values
        .map(
          (value, index) => `
            <div class="tc-bar" style="height:${value}%;background:${colors[index % colors.length]}"></div>
          `,
        )
        .join("")}
      <div class="tc-labels">
        ${labels.map((label) => `<div class="tc-label">${label}</div>`).join("")}
      </div>
    `;
  }

  const heatmap = document.getElementById("heatmap");
  if (heatmap) {
    const palette = [
      "var(--border)",
      "rgba(201,168,92,0.2)",
      "rgba(201,168,92,0.45)",
      "rgba(201,168,92,0.7)",
      "var(--gold)",
    ];

    const cells = Array.from({ length: 84 }, (_, index) => {
      const level = [0, 1, 2, 1, 3, 2, 4][index % 7];
      return `<div class="hmap-cell" style="background:${palette[level]}"></div>`;
    });

    heatmap.innerHTML = cells.join("");
  }

  const weeklyGrid = document.getElementById("weekly-grid");
  if (weeklyGrid) {
    const days = [
      ["Mon", 34, "rgba(107,143,212,0.75)"],
      ["Tue", 40, "rgba(78,201,184,0.75)"],
      ["Wed", 62, "rgba(95,201,143,0.78)"],
      ["Thu", 58, "rgba(95,201,143,0.78)"],
      ["Fri", 44, "rgba(107,143,212,0.75)"],
      ["Sat", 36, "rgba(201,168,92,0.7)"],
      ["Sun", 68, "rgba(212,124,124,0.8)"],
    ];

    weeklyGrid.innerHTML = days
      .map(
        ([label, height, color]) => `
          <div class="wday">
            <div class="wday-label">${label}</div>
            <div class="wday-bar" style="height:${height}px;background:${color}"></div>
          </div>
        `,
      )
      .join("");
  }
}

(async () => {
  initChrome();

  const session = await ensureSession({ redirectTo: "/login" });
  if (!session?.verified) {
    return;
  }

  // Starter characters should still open the live chat page after login.
  if (window.location.pathname === "/dashboard" && localStorage.getItem(STORAGE_KEYS.starterCharacter)) {
    redirect("/chat");
    return;
  }

  fillUserChrome();
  populateInsights();
})();
