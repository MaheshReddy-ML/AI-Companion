const body = document.body;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const roomByPath = {
  "/": "home",
  "/dashboard": "dashboard", "/chat": "chat", "/sessions": "sessions",
  "/insights": "insights", "/journal": "journal", "/goals": "goals",
  "/research": "research", "/community": "community", "/notifications": "notifications",
  "/profile": "profile", "/payment": "payment", "/focus-together": "focus",
  "/help": "support", "/trust": "support", "/status": "support", "/changelog": "support",
  "/login": "auth", "/register": "auth", "/forgot-password": "auth",
  "/verify-otp": "auth", "/reset-password": "auth", "/offline": "support",
};
const path = window.location.pathname.replace(/\/$/, "") || "/";
body.dataset.emoraRoom = roomByPath[path] || "workspace";
body.dataset.networkState = navigator.onLine ? "online" : "offline";
body.dataset.emoraPresence = "idle";
try {
  body.dataset.emoraMotion = localStorage.getItem("emora:motion") || "system";
  body.dataset.emoraContrast = localStorage.getItem("emora:contrast") || "system";
  body.dataset.emoraTextSize = localStorage.getItem("emora:text-size") || "system";
} catch (_) { /* system preferences remain the fallback */ }

const main = document.querySelector("main");
if (main) main.dataset.emoraLayer = "world";
const pageHeader = main?.querySelector(":scope > header, :scope > section:first-child, .workspace-topbar, .top-bar");
if (pageHeader) pageHeader.dataset.emoraLayer = "context";
const primary = main?.querySelector("h1")?.closest("section, article, header, div");
if (primary && primary !== pageHeader) primary.dataset.emoraLayer = "focus";
document.querySelectorAll('[role="status"], [aria-live]').forEach((element) => { element.dataset.emoraLayer = "response"; });

const revealTargets = [...document.querySelectorAll("main > section, main > article, main > div > section")]
  .filter((element) => !element.closest("dialog") && element.getBoundingClientRect().height > 0);
if (reduceMotion.matches || !("IntersectionObserver" in window)) {
  revealTargets.forEach((element) => { element.dataset.emoraReveal = "visible"; });
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.dataset.emoraReveal = "visible";
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: .08 });
  revealTargets.forEach((element, index) => {
    if (element.getBoundingClientRect().top <= window.innerHeight * 1.05) {
      element.dataset.emoraReveal = "visible";
      return;
    }
    element.dataset.emoraReveal = "pending";
    element.style.setProperty("--emora-reveal-delay", `${Math.min(index, 2) * 45}ms`);
    observer.observe(element);
  });
}

function updateNetworkState() {
  body.dataset.networkState = navigator.onLine ? "online" : "offline";
  window.dispatchEvent(new CustomEvent("emora:network-state", { detail: { online: navigator.onLine } }));
}
window.addEventListener("online", updateNetworkState);
window.addEventListener("offline", updateNetworkState);
document.addEventListener("visibilitychange", () => { body.dataset.ambientPaused = String(document.hidden); });

const presenceNames = { LIVE: "present", "WITH YOU": "present", IDLE: "idle", LISTENING: "listening", THINKING: "thinking", SEARCHING: "searching", SPEAKING: "speaking", SAVING: "saving", INTERRUPTED: "interrupted", OFFLINE: "offline", ERROR: "error" };
window.addEventListener("emora:presence", (event) => {
  const source = String(event.detail?.state || "IDLE").toUpperCase();
  body.dataset.emoraPresence = presenceNames[source] || "idle";
  document.querySelectorAll("[data-emora-presence-label]").forEach((element) => { element.textContent = presenceNames[source] || "idle"; });
});

let sensoryContext = null;
function sensoryEnabled() {
  try { return localStorage.getItem("emora:sensory-feedback") === "on"; } catch (_) { return false; }
}
window.addEventListener("emora:sensory-cue", (event) => {
  if (!sensoryEnabled() || document.hidden) return;
  const cue = String(event.detail?.cue || "");
  const pattern = { accepted: [520, .028], saved: [620, .035], joined: [680, .042], complete: [720, .05], interrupted: [330, .035], error: [240, .055] }[cue];
  if (!pattern) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    sensoryContext ||= new AudioContextClass();
    const oscillator = sensoryContext.createOscillator();
    const gain = sensoryContext.createGain();
    oscillator.frequency.value = pattern[0];
    gain.gain.setValueAtTime(.0001, sensoryContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.025, sensoryContext.currentTime + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, sensoryContext.currentTime + pattern[1]);
    oscillator.connect(gain).connect(sensoryContext.destination);
    oscillator.start(); oscillator.stop(sensoryContext.currentTime + pattern[1] + .01);
    if (cue === "error" || cue === "interrupted") navigator.vibrate?.(cue === "error" ? [18,20,18] : 20);
  } catch (_) { /* visual and text state remain authoritative */ }
});

if ("PerformanceObserver" in window) {
  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      window.dispatchEvent(new CustomEvent("emora:performance", { detail: entries.map((entry) => ({ name: entry.name, duration: Math.round(entry.duration) })) }));
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch (_) { /* unsupported metric; never affect the experience */ }
}

function inferDynamicState(element) {
  if (element.hidden) return "hidden";
  if (element.getAttribute("aria-busy") === "true" || element.classList.contains("is-loading")) return "loading";
  if (element.dataset.tone === "error" || /\b(error|failed|unavailable|could not)\b/i.test(element.textContent || "")) return "error";
  if (/\b(offline|reconnect)\b/i.test(element.textContent || "")) return "offline";
  if (/\b(loading|gathering|checking|preparing)\b/i.test(element.textContent || "")) return "loading";
  if (/\b(nothing|no |empty|not yet|will appear|begin with)\b/i.test(element.textContent || "")) return "empty";
  return "ready";
}
const dynamicSurfaces = [...document.querySelectorAll('[role="status"], [aria-live], [id$="-list"], [id$="-output"]')];
const stateObserver = new MutationObserver((records) => {
  new Set(records.map((record) => record.target.closest?.('[role="status"], [aria-live], [id$="-list"], [id$="-output"]')).filter(Boolean)).forEach((element) => { element.dataset.emoraState = inferDynamicState(element); });
});
dynamicSurfaces.forEach((element) => {
  element.dataset.emoraState = inferDynamicState(element);
  stateObserver.observe(element, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "aria-busy", "data-tone"] });
});

function initHomeStory() {
  const acts = [...document.querySelectorAll("[data-story-act]")];
  if (!acts.length) return;
  const rail = document.createElement("nav");
  rail.className = "emora-story-rail";
  rail.setAttribute("aria-label", "Home story progress");
  const labels = { meet: "Meet", understand: "Understand", choose: "Choose" };
  acts.forEach((act, index) => {
    if (!act.id) act.id = `story-${act.dataset.storyAct}`;
    const link = document.createElement("a");
    link.href = `#${act.id}`;
    link.textContent = `${String(index + 1).padStart(2, "0")} ${labels[act.dataset.storyAct] || act.dataset.storyAct}`;
    link.dataset.storyLink = act.dataset.storyAct;
    if (index === 0) link.setAttribute("aria-current", "step");
    rail.append(link);
  });
  document.querySelector(".cinematic-site")?.append(rail);
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver((entries) => {
    const current = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!current) return;
    rail.querySelectorAll("a").forEach((link) => {
      if (link.dataset.storyLink === current.target.dataset.storyAct) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
  }, { threshold: [.25, .55] });
  acts.forEach((act) => observer.observe(act));
}

function initHomeDemo() {
  const tabs = [...document.querySelectorAll("[data-demo-journey]")];
  const panels = [...document.querySelectorAll("[data-demo-panel]")];
  if (!tabs.length || !panels.length) return;
  const activate = (name, focus = false) => {
    tabs.forEach((tab) => { const active = tab.dataset.demoJourney === name; tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1; if (active && focus) tab.focus(); });
    panels.forEach((panel) => { panel.hidden = panel.dataset.demoPanel !== name; });
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab.dataset.demoJourney));
    tab.addEventListener("keydown", (event) => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      activate(tabs[next].dataset.demoJourney, true);
    });
  });
  activate("talk");
}

function initAuthJourney() {
  const panel = document.querySelector(".auth-doorway-panel");
  if (!panel) return;
  const map = {
    "Login": ["RETURN", "Sign in securely"], "Register": ["BEGIN", "Create your private space"],
    "Forgot Password": ["RECOVER / 01", "Find your account"], "Verify OTP": ["RECOVER / 02", "Verify the code"],
    "Reset Password": ["RECOVER / 03", "Choose a new password"],
  };
  const [step, label] = map[body.dataset.pageTitle] || ["ARRIVE", body.dataset.pageTitle];
  const progress = document.createElement("div");
  progress.className = "auth-journey-progress";
  const marker = document.createElement("span");
  const copy = document.createElement("strong");
  marker.textContent = step;
  copy.textContent = label;
  progress.append(marker, copy);
  panel.prepend(progress);
  const requestedGoal = new URLSearchParams(window.location.search).get("goal");
  if (["talk", "reflect", "goal", "focus", "research", "meet_emora"].includes(requestedGoal)) {
    try { sessionStorage.setItem("emora:first-goal", requestedGoal); } catch (_) { /* optional arrival continuity only */ }
  }
  const nonSecretField = document.querySelector('input[type="email"], input[name="identifier"]');
  if (nonSecretField) {
    try { if (!nonSecretField.value) nonSecretField.value = sessionStorage.getItem("emora:auth-email") || ""; } catch (_) { /* optional continuity only */ }
    nonSecretField.addEventListener("input", () => { try { sessionStorage.setItem("emora:auth-email", nonSecretField.value.trim().slice(0,254)); } catch (_) {} });
  }
}

function initChatViews() {
  const route = document.querySelector(".chat-route-layout");
  const controls = [...document.querySelectorAll("[data-chat-view]")];
  if (!route || !controls.length) return;
  const activate = (view) => {
    route.dataset.chatView = view;
    controls.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.chatView === view)));
    if (view === "inspect") {
      const tools = document.getElementById("companion-tools");
      if (tools?.hidden) document.getElementById("companion-tools-button")?.click();
    }
    if (view === "navigate") {
      route.classList.remove("sidebar-collapsed");
      document.querySelector(".workspace-rail-search input")?.focus({ preventScroll: true });
    }
    if (view === "converse" && !document.getElementById("companion-tools")?.hidden) document.getElementById("companion-tools-close")?.click();
  };
  controls.forEach((button) => button.addEventListener("click", () => activate(button.dataset.chatView)));
  activate("converse");
}

function initSectionJourney() {
  const config = {
    sessions: [[".sessions-builder", "Arrive"], ["#weekly-review", "Look back"], ["#memory-center", "Remember"], [".sessions-history", "Return"]],
    insights: [["#insights-journey", "Overview"], [".insights-moments", "Moments"], ["#insights-patterns", "Patterns"], ["#insights-history", "History"]],
  }[body.dataset.emoraRoom];
  const main = document.querySelector("main");
  if (!config || !main) return;
  const nav = document.createElement("nav");
  nav.className = "emora-phase-line";
  nav.setAttribute("aria-label", `${body.dataset.pageTitle} journey`);
  const targets = config.map(([selector, label], index) => {
    const target = document.querySelector(selector);
    if (!target) return null;
    if (!target.id) target.id = `${body.dataset.emoraRoom}-phase-${index + 1}`;
    const link = document.createElement("a");
    link.href = `#${target.id}`;
    link.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><strong>${label}</strong>`;
    nav.append(link);
    return { target, link };
  }).filter(Boolean);
  main.prepend(nav);
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      targets.forEach(({ link, target }) => link.toggleAttribute("aria-current", target === entry.target));
    });
  }, { rootMargin: "-22% 0px -65%", threshold: 0 });
  targets.forEach(({ target }) => observer.observe(target));
}

function initStudioModes() {
  const layout = document.querySelector(".studio-body .journal-layout");
  if (!layout) return;
  const editor = layout.querySelector(".journal-editor");
  const archive = layout.querySelector(".journal-feed");
  if (!editor || !archive) return;
  const noun = body.classList.contains("editorial-goals") ? "Path" : "Archive";
  const switcher = document.createElement("div");
  switcher.className = "studio-mode-switcher";
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", `${body.dataset.pageTitle} view`);
  [["compose", body.classList.contains("editorial-goals") ? "Add a goal" : "Write"], ["archive", noun]].forEach(([mode, label], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.studioMode = mode;
    button.textContent = label;
    button.setAttribute("aria-pressed", String(index === 0));
    switcher.append(button);
  });
  layout.before(switcher);
  const activate = (mode) => {
    layout.dataset.studioMode = mode;
    editor.hidden = mode === "archive";
    archive.hidden = mode === "compose";
    switcher.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.studioMode === mode)));
    (mode === "archive" ? archive : editor).querySelector("h2, input, textarea")?.focus({ preventScroll: true });
  };
  switcher.addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) activate(button.dataset.studioMode); });
  archive.addEventListener("click", (event) => { if (event.target.closest("[data-edit]")) activate("compose"); });
  activate(window.location.hash === "#archive" || body.classList.contains("editorial-goals") ? "archive" : "compose");
}

function initResearchDesk() {
  const main = document.querySelector(".research-shell");
  const studio = document.querySelector(".research-studio");
  const shelf = document.querySelector(".research-shelf");
  const synthesis = document.querySelector(".research-synthesis");
  if (!main || !studio || !shelf || !synthesis) return;
  const nav = document.createElement("nav");
  nav.className = "research-desk-nav";
  nav.setAttribute("aria-label", "Research workspace");
  [[studio,"question","Question"],[shelf,"sources","Sources"],[synthesis,"synthesis","Synthesis"]].forEach(([target, mode, label], index) => {
    target.dataset.researchZone = mode;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.researchMode = mode;
    button.textContent = `${String(index + 1).padStart(2,"0")} ${label}`;
    button.setAttribute("aria-pressed", String(index === 0));
    nav.append(button);
  });
  document.querySelector(".research-hero")?.after(nav);
  nav.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    nav.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    document.querySelector(`[data-research-zone="${button.dataset.researchMode}"]`)?.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
  });
}

function initCommunityReadingRoom() {
  const compose = document.getElementById("community-compose-card");
  const feed = document.querySelector(".post-feed");
  if (!compose || !feed) return;
  compose.dataset.communityAlcove = "closed";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "community-alcove-trigger";
  trigger.textContent = "Share a reflection when you are ready";
  trigger.setAttribute("aria-expanded", "false");
  trigger.addEventListener("click", () => {
    const open = compose.dataset.communityAlcove !== "open";
    compose.dataset.communityAlcove = open ? "open" : "closed";
    trigger.setAttribute("aria-expanded", String(open));
    trigger.textContent = open ? "Return to reading" : "Share a reflection when you are ready";
    if (open) compose.querySelector("textarea")?.focus({ preventScroll: true });
  });
  compose.before(trigger);
}

function initProfileControlRoom() {
  const main = document.querySelector(".profile-settings-page main");
  if (!main) return;
  const zones = [
    ["#profile-identity", "Inputs"], ["#profile-companion", "Processing"],
    ["#profile-reflections", "Memory"], ["#profile-continuity", "Connections"],
    ["#profile-privacy", "Retention"],
  ].map(([selector, label]) => [document.querySelector(selector), label]).filter(([target]) => target);
  if (!zones.length) return;
  const map = document.createElement("nav");
  map.className = "profile-data-map";
  map.setAttribute("aria-label", "Profile data flow");
  zones.forEach(([target, label], index) => {
    if (!target.id) target.id = `profile-zone-${index}`;
    const link = document.createElement("a");
    link.href = `#${target.id}`;
    link.innerHTML = `<span>${String(index + 1).padStart(2,"0")}</span><strong>${label}</strong>`;
    map.append(link);
  });
  main.prepend(map);
}

function initPaymentJourney() {
  const page = document.querySelector(".payment-page");
  if (!page) return;
  const targets = [[".payment-story","Value"],[".checkout-card","Plan"],[".plan-comparison","Compare"],[".payment-faq","Terms"]];
  const nav = document.createElement("nav");
  nav.className = "payment-journey";
  nav.setAttribute("aria-label", "Plan journey");
  targets.forEach(([selector,label],index) => {
    const target = document.querySelector(selector);
    if (!target) return;
    if (!target.id) target.id = `payment-step-${index + 1}`;
    const link = document.createElement("a");
    link.href = `#${target.id}`;
    link.innerHTML = `<span>${String(index + 1).padStart(2,"0")}</span>${label}`;
    nav.append(link);
  });
  document.querySelector(".payment-nav")?.after(nav);
}

function initFactualConcierge() {
  if (body.dataset.emoraRoom !== "support") return;
  const main = document.querySelector("main");
  if (!main) return;
  const nav = document.createElement("nav");
  nav.className = "factual-concierge";
  nav.setAttribute("aria-label", "Help and trust");
  [["/help","Help"],["/trust","Trust"],["/status","Status"],["/changelog","Changes"]].forEach(([href,label]) => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    if (path === href) link.setAttribute("aria-current","page");
    nav.append(link);
  });
  main.prepend(nav);
}

function initContextualConcierge() {
  const drawer = document.getElementById("emora-contextual-concierge");
  const openers = [...document.querySelectorAll("[data-emora-concierge-open]")];
  if (!drawer || !openers.length) return;
  const search = drawer.querySelector("[data-emora-concierge-search]");
  const links = [...drawer.querySelectorAll("[data-concierge-topic]")];
  const empty = drawer.querySelector("[data-concierge-empty]");
  let returnFocus = null;
  const close = () => { drawer.hidden = true; body.removeAttribute("data-concierge-open"); returnFocus?.focus({ preventScroll: true }); };
  openers.forEach((button) => button.addEventListener("click", () => { returnFocus = button; drawer.hidden = false; body.dataset.conciergeOpen = "true"; search?.focus({ preventScroll: true }); }));
  drawer.querySelector("[data-emora-concierge-close]")?.addEventListener("click", close);
  drawer.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  search?.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    links.forEach((link) => { link.hidden = Boolean(query) && !`${link.dataset.conciergeTopic} ${link.textContent}`.toLowerCase().includes(query); });
    empty.hidden = links.some((link) => !link.hidden);
  });
}

initHomeStory();
initHomeDemo();
initAuthJourney();
initChatViews();
initSectionJourney();
initStudioModes();
initResearchDesk();
initCommunityReadingRoom();
initProfileControlRoom();
initPaymentJourney();
initFactualConcierge();
initContextualConcierge();
