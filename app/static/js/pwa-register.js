if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {}); }, { once: true });
}
