import { apiRequest, escapeHtml, getStoredUser, getToken, initChrome, setStoredUser } from "./common.js";

const state = { plan: "plus", cycle: "yearly", method: "card", plans: [], access: null };
const form = document.getElementById("checkout-form");
const status = document.getElementById("checkout-status");
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function selectedPlan() {
  return state.plans.find((plan) => plan.id === state.plan);
}

function monthlyEquivalent(plan) {
  return state.cycle === "yearly" ? Math.round(plan.yearly / 12) : plan.monthly;
}

function renderPlan() {
  const plan = selectedPlan();
  if (!plan) return;
  const free = plan.id === "free";
  const fullAmount = plan[state.cycle];
  const equivalent = monthlyEquivalent(plan);
  const yearlySaving = Math.max(0, plan.monthly * 12 - plan.yearly);

  document.getElementById("checkout-title").textContent = `Choose Emora ${plan.name}`;
  document.querySelector("[data-plan-price]").textContent = free ? "₹0" : currency.format(equivalent);
  document.querySelector(".checkout-price-period").textContent = free ? " forever" : "/ month";
  document.querySelector("[data-plan-billing]").textContent = free ? "No payment required" : state.cycle === "yearly" ? `Billed ${currency.format(fullAmount)} once a year` : "Billed monthly";
  document.querySelector("[data-plan-saving]").textContent = free ? "Core access" : state.cycle === "yearly" ? `Save ${currency.format(yearlySaving)}` : "Flexible plan";
  document.querySelector("[data-checkout-label]").textContent = free ? "Continue with Free" : `Request ${plan.name} · ${state.cycle}`;
  document.querySelector("[data-plan-includes-label]").textContent = plan.id === "free" ? "Included with Free:" : `${plan.name} includes:`;
  document.getElementById("checkout-feature-list").innerHTML = plan.features.map((feature) => `<li><span>✓</span> ${escapeHtml(feature)}</li>`).join("");

  document.querySelectorAll("[data-plan-id]").forEach((button) => {
    const active = button.dataset.planId === state.plan;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll("[data-billing-cycle]").forEach((button) => {
    const active = button.dataset.billingCycle === state.cycle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
    button.disabled = free;
    button.tabIndex = active && !free ? 0 : -1;
  });
  document.querySelector(".checkout-divider").hidden = free;
  document.querySelector(".payment-methods").hidden = free;
  document.querySelectorAll("[data-payment-panel] input").forEach((input) => { input.disabled = free; });
}

function renderComparison() {
  const target = document.getElementById("plan-comparison-grid");
  target.innerHTML = state.plans.map((plan) => `
    <article class="comparison-plan ${plan.id === "pro" ? "recommended" : ""}">
      ${plan.id === "pro" ? "<em>Most balanced</em>" : ""}
      <span>${escapeHtml(plan.name)}</span><h3>${plan.monthly ? `${currency.format(plan.monthly)}<small>/mo</small>` : "Free"}</h3><p>${escapeHtml(plan.tagline)}</p>
      <ul>${plan.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}<li>${Number(plan.limits?.chatMessageCharacters || 0).toLocaleString()} characters per chat message · ${Number(plan.limits?.chatConcurrentRequests || 1)} concurrent</li>${plan.limits?.ttsCharacters ? `<li>${Number(plan.limits.ttsCharacters).toLocaleString()} characters per speech request · ${Number(plan.limits.ttsConcurrentRequests)} concurrent</li>` : ""}</ul>
      <button type="button" data-compare-plan="${plan.id}">${plan.id === "free" ? "Choose Free" : `Choose ${escapeHtml(plan.name)}`}</button>
    </article>
  `).join("");
}

function setPaymentMethod(method) {
  state.method = method;
  document.querySelectorAll("[data-payment-method]").forEach((button) => {
    const active = button.dataset.paymentMethod === method;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll("[data-payment-panel]").forEach((panel) => {
    const active = panel.dataset.paymentPanel === method;
    panel.hidden = !active;
    panel.querySelectorAll("input").forEach((input) => {
      input.required = active && state.plan !== "free";
      input.disabled = !active || state.plan === "free";
    });
  });
}

function renderAccess(payload) {
  state.access = payload.access;
  document.querySelectorAll("[data-current-plan]").forEach((element) => { element.textContent = state.access.planName; });
  const pending = payload.pendingRequest;
  if (pending) {
    status.textContent = `${pending.plan.toUpperCase()} request pending verification.`;
    status.hidden = false;
  }
  const admin = document.getElementById("billing-admin");
  admin.hidden = !state.access.isAdmin;
  if (state.access.isAdmin) loadAdminUsers();
}

function formatCardNumber(event) {
  const digits = event.target.value.replace(/\D/g, "").slice(0, 16);
  event.target.value = digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(event) {
  const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
  event.target.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

async function loadAdminUsers(search = "") {
  const target = document.getElementById("admin-user-list");
  const adminStatus = document.getElementById("admin-subscription-status");
  target.innerHTML = '<p class="muted">Loading accounts…</p>';
  try {
    const data = await apiRequest(`/api/billing/admin/users?search=${encodeURIComponent(search)}`, { auth: true });
    target.innerHTML = (data.users || []).map((user) => `
      <article class="admin-user-row" data-admin-user="${escapeHtml(user.id)}">
        <div><strong>${escapeHtml(user.name || "Unnamed account")}</strong><span>${escapeHtml(user.email)}</span><small>${escapeHtml(user.access.planName)} · ${escapeHtml(user.access.status)}</small></div>
        <label>Plan<select data-admin-plan><option value="free">Free</option><option value="plus">Plus</option><option value="pro">Pro</option><option value="complete">Complete</option></select></label>
        <label>Status<select data-admin-status><option value="active">Active</option><option value="trialing">Trialing</option><option value="inactive">Inactive</option><option value="canceled">Canceled</option></select></label>
        <button type="button" data-admin-save>Update access</button>
      </article>
    `).join("") || '<p class="muted">No accounts found.</p>';
    target.querySelectorAll("[data-admin-user]").forEach((row) => {
      const user = data.users.find((item) => item.id === row.dataset.adminUser);
      row.querySelector("[data-admin-plan]").value = user.access.isAdmin ? "complete" : user.access.plan;
      row.querySelector("[data-admin-status]").value = user.access.isAdmin ? "active" : (user.subscription?.status || "inactive");
    });
    adminStatus.hidden = true;
  } catch (error) {
    target.innerHTML = "";
    adminStatus.textContent = error.message || "Could not load accounts.";
    adminStatus.hidden = false;
  }
}

document.querySelectorAll("[data-plan-id]").forEach((button) => button.addEventListener("click", () => { state.plan = button.dataset.planId; renderPlan(); setPaymentMethod(state.method); }));
document.querySelectorAll("[data-billing-cycle]").forEach((button) => button.addEventListener("click", () => { state.cycle = button.dataset.billingCycle; renderPlan(); }));
document.querySelectorAll("[data-payment-method]").forEach((button) => button.addEventListener("click", () => setPaymentMethod(button.dataset.paymentMethod)));

function bindChoiceKeyboard(containerSelector, buttonSelector) {
  document.querySelector(containerSelector)?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const buttons = [...document.querySelectorAll(buttonSelector)].filter((button) => !button.disabled && !button.closest("[hidden]"));
    const current = event.target.closest(buttonSelector);
    if (!current || !buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(current);
    const forward = ["ArrowRight", "ArrowDown"].includes(event.key);
    const next = event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1) : buttons[(index + (forward ? 1 : -1) + buttons.length) % buttons.length];
    next.focus();
    next.click();
  });
}

bindChoiceKeyboard(".plan-picker", "[data-plan-id]");
bindChoiceKeyboard(".billing-toggle", "[data-billing-cycle]");
bindChoiceKeyboard(".payment-methods", "[data-payment-method]");
document.getElementById("plan-comparison-grid")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-compare-plan]");
  if (!button) return;
  state.plan = button.dataset.comparePlan;
  renderPlan();
  document.querySelector(".checkout-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

form.elements.cardNumber.addEventListener("input", formatCardNumber);
form.elements.expiry.addEventListener("input", formatExpiry);
form.elements.cvv.addEventListener("input", (event) => { event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4); });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.hidden = true;
  if (state.plan === "free") {
    status.textContent = getToken() ? "Free access is already active on your account." : "Sign in to begin with Free access.";
    status.hidden = false;
    if (!getToken()) window.setTimeout(() => window.location.assign("/login?next=/payment"), 700);
    return;
  }
  if (!getToken()) {
    window.location.assign("/login?next=/payment");
    return;
  }
  if (!form.reportValidity()) return;
  const submit = form.querySelector("[type='submit']");
  submit.disabled = true;
  try {
    const response = await apiRequest("/api/billing/checkout", { method: "POST", auth: true, body: { plan: state.plan, cycle: state.cycle, paymentMethod: state.method } });
    status.textContent = response.message;
    status.hidden = false;
  } catch (error) {
    status.textContent = error.message || "Could not create the plan request.";
    status.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("admin-user-search-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadAdminUsers(document.getElementById("admin-user-search").value.trim());
});
document.getElementById("admin-user-list")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-admin-save]");
  if (!button) return;
  const row = button.closest("[data-admin-user]");
  const adminStatus = document.getElementById("admin-subscription-status");
  button.disabled = true;
  try {
    const response = await apiRequest(`/api/billing/admin/users/${row.dataset.adminUser}/subscription`, { method: "PATCH", auth: true, body: { plan: row.querySelector("[data-admin-plan]").value, status: row.querySelector("[data-admin-status]").value } });
    await loadAdminUsers(document.getElementById("admin-user-search").value.trim());
    adminStatus.textContent = `${response.user.email} now has ${response.user.access.planName} access.`;
    adminStatus.hidden = false;
  } catch (error) {
    adminStatus.textContent = error.message || "Could not update access.";
    adminStatus.hidden = false;
  } finally {
    button.disabled = false;
  }
});

async function initPayment() {
  initChrome();
  const catalog = await apiRequest("/api/billing/plans");
  state.plans = catalog.plans || [];
  const requestedFeature = new URLSearchParams(window.location.search).get("feature");
  if (["voice", "extended_chat", "companion_memory", "look_back", "conversation_export"].includes(requestedFeature)) state.plan = "plus";
  if (["conversation_remix", "ambient_rooms", "focus_rooms", "advanced_insights", "adaptive_companion"].includes(requestedFeature)) state.plan = "pro";
  if (["voice_postcards", "extended_limits", "priority_generation", "early_access"].includes(requestedFeature)) state.plan = "complete";
  renderComparison();
  renderPlan();
  setPaymentMethod(state.method);
  if (getToken()) {
    try {
      const access = await apiRequest("/api/billing/access", { auth: true });
      renderAccess(access);
      const user = getStoredUser();
      if (user) setStoredUser({ ...user, access: access.access });
    } catch {
      document.querySelectorAll("[data-current-plan]").forEach((element) => { element.textContent = "SIGN IN TO VIEW"; });
    }
  } else {
    document.querySelectorAll("[data-current-plan]").forEach((element) => { element.textContent = "GUEST"; });
  }
}

initPayment().catch(() => {
  status.textContent = "Plan details are temporarily unavailable.";
  status.hidden = false;
});
