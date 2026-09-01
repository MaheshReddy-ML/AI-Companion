const summary = document.getElementById("public-status-summary");
const list = document.getElementById("public-status-components");

fetch("/api/public/status", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error("status unavailable");
    return response.json();
  })
  .then((payload) => {
    summary.textContent = payload.status === "operational" ? "The website is responding. Individual optional capabilities are shown below." : "Some services need attention.";
    list.replaceChildren(...Object.entries(payload.components || {}).map(([name, state]) => {
      const row = document.createElement("div");
      const label = document.createElement("strong");
      const value = document.createElement("span");
      label.textContent = name.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
      value.textContent = String(state).replaceAll("_", " ");
      row.append(label, value);
      return row;
    }));
  })
  .catch(() => {
    summary.textContent = "Current component details could not be loaded. The page itself is available.";
  });
