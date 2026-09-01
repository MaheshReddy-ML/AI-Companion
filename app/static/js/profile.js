import {
  apiRequest,
  displayNameForUser,
  ensureSession,
  escapeHtml,
  getStoredUser,
  renderUserAvatar,
  setStoredUser,
  showStatus,
} from "./common.js";

const elements = {
  gallery: document.getElementById("avatar-gallery"),
  filterButtons: Array.from(document.querySelectorAll("[data-avatar-filter]")),
  status: document.getElementById("avatar-status"),
  uploadInput: document.getElementById("avatar-upload-input"),
  currentLabel: document.getElementById("avatar-current-label"),
  currentSource: document.getElementById("avatar-current-source"),
  currentHint: document.getElementById("avatar-current-hint"),
  accountExportButton: document.getElementById("account-export-button"),
  clearHistoryButton: document.getElementById("clear-history-button"),
  deleteAccountButton: document.getElementById("delete-account-button"),
  editButton: document.getElementById("profile-edit-button"),
  avatarStudio: document.querySelector(".avatar-studio"),
  preferenceButtons: Array.from(document.querySelectorAll("[data-profile-preference]")),
  preferenceSelects: Array.from(document.querySelectorAll("[data-profile-select]")),
  environmentSelect: document.getElementById("profile-environment"),
  streakBadge: document.getElementById("profile-streak-badge"),
  sessionBadge: document.getElementById("profile-session-badge"),
  memberSince: document.getElementById("profile-member-since"),
  accessibilityReset: document.getElementById("accessibility-reset-button"),
  scheduleForm: document.getElementById("check-in-schedule-form"),
  scheduleEnabled: document.getElementById("schedule-enabled"),
  scheduleChannel: document.getElementById("schedule-channel"),
  scheduleTime: document.getElementById("schedule-time"),
  scheduleTimezone: document.getElementById("schedule-timezone"),
  scheduleDays: document.getElementById("schedule-days"),
  scheduleQuietStart: document.getElementById("schedule-quiet-start"),
  scheduleQuietEnd: document.getElementById("schedule-quiet-end"),
  scheduleStatus: document.getElementById("schedule-status"),
  sessionList: document.getElementById("profile-session-list"),
  securityEvents: document.getElementById("profile-security-events"),
  revokeOthers: document.getElementById("revoke-other-sessions"),
  privacyCounts: document.getElementById("privacy-count-grid"),
  privacyStorage: document.getElementById("privacy-storage-copy"),
  restoreFile: document.getElementById("account-restore-file"),
  restoreMode: document.getElementById("account-restore-mode"),
  restorePreview: document.getElementById("account-restore-preview"),
  restoreOutput: document.getElementById("account-restore-preview-output"),
  restoreCommit: document.getElementById("account-restore-commit"),
};

const state = {
  presets: [],
  filter: "all",
  user: null,
  busy: false,
  preferences: {},
  preferenceVersion: 1,
  restorePayload: null,
};

function applyAccessibility() {
  document.body.dataset.emoraTextSize = state.preferences.textSize || "system";
  document.body.dataset.emoraMotion = state.preferences.motion || "system";
  document.body.dataset.emoraContrast = state.preferences.contrast || "system";
  document.body.dataset.emoraCalmEffects = String(Boolean(state.preferences.calmEffects));
  try {
    localStorage.setItem("emora:sensory-feedback", state.preferences.sensoryFeedback ? "on" : "off");
    localStorage.setItem("emora:motion", state.preferences.motion || "system");
    localStorage.setItem("emora:contrast", state.preferences.contrast || "system");
    localStorage.setItem("emora:text-size", state.preferences.textSize || "system");
  } catch (_) { /* storage may be unavailable */ }
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Recently";
}

function syncPreferenceSelectStyle(select, { confirmed = false } = {}) {
  const control = select.closest("label");
  if (!control) return;
  control.classList.add("is-selected");
  control.dataset.selectedValue = select.options[select.selectedIndex]?.textContent?.trim() || select.value;
  if (!confirmed) return;
  control.classList.remove("selection-confirmed");
  window.requestAnimationFrame(() => control.classList.add("selection-confirmed"));
  window.setTimeout(() => control.classList.remove("selection-confirmed"), 520);
}

function getCurrentName() {
  return displayNameForUser(state.user || getStoredUser());
}

function renderAllUserAvatars() {
  const user = state.user || getStoredUser();
  const label = getCurrentName();
  document.querySelectorAll("[data-session-avatar]").forEach((element) => {
    renderUserAvatar(element, user, label);
  });
}

function getVisiblePresets() {
  if (state.filter === "all") {
    return state.presets;
  }
  return state.presets.filter((preset) => preset.gender === state.filter);
}

function getSourceLabel(user) {
  if (user?.avatarSource === "custom") {
    return "Using your uploaded photo";
  }

  if (user?.avatarGender === "female") {
    return "Built-in female preset";
  }

  if (user?.avatarGender === "male") {
    return "Built-in male preset";
  }

  return "Built-in preset";
}

function renderCurrentMeta() {
  const user = state.user || getStoredUser();
  if (!elements.currentLabel || !elements.currentSource || !elements.currentHint) {
    return;
  }

  elements.currentLabel.textContent =
    user?.avatarSource === "custom" ? "Custom avatar active" : user?.avatarLabel || "Preset avatar active";
  elements.currentSource.textContent = getSourceLabel(user);
  elements.currentHint.textContent =
    user?.avatarSource === "custom"
      ? "You can keep your upload, switch back to a preset anytime, or upload another image."
      : "A default avatar is assigned automatically. You can swap to any preset or upload your own image.";
  if (elements.memberSince) {
    const createdAt = user?.createdAt ? new Date(user.createdAt) : null;
    elements.memberSince.textContent = createdAt && !Number.isNaN(createdAt.getTime())
      ? `Member since ${createdAt.toLocaleDateString([], { month: "long", year: "numeric" })}`
      : "Member";
  }
}

function renderFilterState() {
  elements.filterButtons.forEach((button) => {
    const active = button.dataset.avatarFilter === state.filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
}

function renderGallery() {
  if (!elements.gallery) {
    return;
  }

  const visiblePresets = getVisiblePresets();
  if (!visiblePresets.length) {
    elements.gallery.innerHTML = '<p class="muted text-sm">No avatar presets found for this filter.</p>';
    return;
  }

  const activePresetId = state.user?.avatarSource === "preset" ? state.user?.avatarPresetId : null;
  elements.gallery.innerHTML = visiblePresets
    .map((preset) => {
      const isActive = preset.id === activePresetId;
      const genderLabel = preset.gender === "female" ? "Female" : "Male";

      return `
        <button
          class="avatar-card ${isActive ? "active" : ""}"
          type="button"
          data-preset-id="${escapeHtml(preset.id)}"
          aria-pressed="${isActive ? "true" : "false"}"
        >
          <div class="avatar-card-media">
            <img src="${escapeHtml(preset.url)}" alt="${escapeHtml(preset.label)} avatar" loading="lazy" />
          </div>
          <div class="avatar-card-copy">
            <strong>${escapeHtml(preset.label)}</strong>
            <span>${genderLabel} preset</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function setBusy(nextBusy) {
  state.busy = nextBusy;

  elements.filterButtons.forEach((button) => {
    button.disabled = nextBusy;
  });

  if (elements.uploadInput) {
    elements.uploadInput.disabled = nextBusy;
  }

  if (elements.gallery) {
    elements.gallery.querySelectorAll("[data-preset-id]").forEach((button) => {
      button.disabled = nextBusy;
    });
  }
}

async function applyUserUpdate(nextUser, message) {
  state.user = nextUser;
  setStoredUser(nextUser);
  renderAllUserAvatars();
  renderCurrentMeta();
  renderGallery();
  showStatus(elements.status, message, "success");
}

async function handlePresetSelection(presetId) {
  if (!presetId || state.busy) {
    return;
  }

  try {
    setBusy(true);
    showStatus(elements.status, "Saving your new avatar...", "info");
    const response = await apiRequest("/api/auth/profile/avatar/preset", {
      method: "PUT",
      auth: true,
      body: { presetId },
    });
    await applyUserUpdate(response.user, response.message || "Avatar updated.");
  } catch (error) {
    showStatus(elements.status, error.message || "Could not update your avatar.");
  } finally {
    setBusy(false);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Could not read the selected image.")));
    reader.readAsDataURL(file);
  });
}

async function handleUpload(file) {
  if (!file || state.busy) {
    return;
  }

  if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
    showStatus(elements.status, "Please choose a PNG, JPG, or WEBP image.");
    return;
  }

  if (file.size > 3 * 1024 * 1024) {
    showStatus(elements.status, "Keep the image under 3 MB.");
    return;
  }

  try {
    setBusy(true);
    showStatus(elements.status, "Uploading your photo...", "info");
    const imageDataUrl = await readFileAsDataUrl(file);
    const response = await apiRequest("/api/auth/profile/avatar/upload", {
      method: "PUT",
      auth: true,
      body: { imageDataUrl },
    });
    await applyUserUpdate(response.user, response.message || "Custom avatar saved.");
  } catch (error) {
    showStatus(elements.status, error.message || "Could not upload your avatar.");
  } finally {
    if (elements.uploadInput) {
      elements.uploadInput.value = "";
    }
    setBusy(false);
  }
}

function bindEvents() {
  elements.editButton?.addEventListener("click", () => {
    elements.avatarStudio?.scrollIntoView({ behavior: "smooth", block: "center" });
    elements.avatarStudio?.classList.remove("profile-spotlight");
    window.requestAnimationFrame(() => elements.avatarStudio?.classList.add("profile-spotlight"));
    showStatus(elements.status, "Choose an avatar or upload a photo to personalise your profile.", "info");
  });

  elements.preferenceButtons.forEach((button) => {
    const key = button.dataset.profilePreference;
    button.disabled = true;
    button.addEventListener("click", async () => {
      if (!key || button.disabled) return;
      const previousValue = Boolean(state.preferences[key]);
      const nextValue = !previousValue;
      button.classList.toggle("on", nextValue);
      button.setAttribute("aria-checked", String(nextValue));
      button.disabled = true;
      button.animate([{ transform: "scale(.82)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 360, easing: "cubic-bezier(.2,.9,.25,1)" });
      try {
        const response = await apiRequest("/api/personal/preferences", { method: "PATCH", auth: true, body: { [key]: nextValue, expectedVersion: state.preferenceVersion } });
        state.preferences = response.preferences || {};
        state.preferenceVersion = response.version || state.preferenceVersion + 1;
        applyAccessibility();
        showStatus(elements.status, `${button.getAttribute("aria-label")?.replace("Toggle ", "") || "Preference"} ${nextValue ? "enabled" : "paused"} for your account.`, "success");
      } catch (error) {
        const serverPreferences = error.status === 409 ? error.data?.detail?.current : null;
        const resolved = serverPreferences && window.confirm("These preferences changed on another device. Choose OK to load that version, or Cancel to keep the control as it was here.") ? Boolean(serverPreferences[key]) : previousValue;
        if (serverPreferences && resolved !== previousValue) { state.preferences = serverPreferences; state.preferenceVersion = error.data.detail.version || state.preferenceVersion; }
        button.classList.toggle("on", resolved);
        button.setAttribute("aria-checked", String(resolved));
        showStatus(elements.status, error.message || "Could not save this preference.");
      } finally {
        button.disabled = false;
      }
    });
  });
  elements.preferenceSelects.forEach((select) => {
    select.addEventListener("change", async () => {
      const key = select.dataset.profileSelect;
      const previous = state.preferences[key];
      const control = select.closest("label");
      syncPreferenceSelectStyle(select);
      select.disabled = true;
      control?.classList.add("is-saving");
      try {
        const response = await apiRequest("/api/personal/preferences", { method: "PATCH", auth: true, body: { [key]: select.value, expectedVersion: state.preferenceVersion } });
        state.preferences = response.preferences || state.preferences;
        state.preferenceVersion = response.version || state.preferenceVersion + 1;
        applyAccessibility();
        syncPreferenceSelectStyle(select, { confirmed: true });
        showStatus(elements.status, `${select.options[select.selectedIndex]?.textContent || "Preference"} selected for ${control?.querySelector("span")?.textContent || "this mode"}.`, "success");
      } catch (error) {
        const serverPreferences = error.status === 409 ? error.data?.detail?.current : null;
        const loadServer = serverPreferences && window.confirm("These preferences changed on another device. Choose OK to load that version, or Cancel to keep your local selection for comparison.");
        select.value = loadServer ? serverPreferences[key] : previous;
        if (loadServer) { state.preferences = serverPreferences; state.preferenceVersion = error.data.detail.version || state.preferenceVersion; applyAccessibility(); }
        syncPreferenceSelectStyle(select);
        showStatus(elements.status, error.message || "Could not save this preference.");
      } finally {
        select.disabled = false;
        control?.classList.remove("is-saving");
      }
    });
  });
  elements.environmentSelect?.addEventListener("change", async () => {
    const previous = elements.environmentSelect.dataset.current;
    try {
      const response = await apiRequest("/api/experiences/space", { method: "PUT", auth: true, body: { environment: elements.environmentSelect.value } });
      elements.environmentSelect.dataset.current = response.space.environment;
    } catch (error) {
      elements.environmentSelect.value = previous;
      showStatus(elements.status, error.message || "Could not change your environment.");
    }
  });

  elements.accessibilityReset?.addEventListener("click", async () => {
    try {
      const response = await apiRequest("/api/personal/preferences", { method: "PATCH", auth: true, body: { textSize: "system", motion: "system", contrast: "system", calmEffects: false, expectedVersion: state.preferenceVersion } });
      state.preferences = response.preferences || state.preferences;
      state.preferenceVersion = response.version || state.preferenceVersion + 1;
      elements.preferenceSelects.forEach((select) => { if (["textSize", "motion", "contrast"].includes(select.dataset.profileSelect)) select.value = "system"; });
      const calmToggle = elements.preferenceButtons.find((button) => button.dataset.profilePreference === "calmEffects");
      calmToggle?.classList.remove("on"); calmToggle?.setAttribute("aria-checked", "false");
      applyAccessibility();
      showStatus(elements.status, "Accessibility preferences now follow your system.", "success");
    } catch (error) { showStatus(elements.status, error.message || "Could not reset accessibility preferences."); }
  });

  elements.scheduleEnabled?.addEventListener("click", async () => {
    const enabled = elements.scheduleEnabled.getAttribute("aria-checked") !== "true";
    elements.scheduleEnabled.classList.toggle("on", enabled);
    elements.scheduleEnabled.setAttribute("aria-checked", String(enabled));
    if (!enabled) {
      try {
        await apiRequest("/api/workspace/schedule", { method: "PUT", auth: true, body: { enabled: false, channel: elements.scheduleChannel.value, time: elements.scheduleTime.value, timezone: elements.scheduleTimezone.value, days: [...elements.scheduleDays.selectedOptions].map((option) => Number(option.value)), quietStart: elements.scheduleQuietStart.value, quietEnd: elements.scheduleQuietEnd.value } });
        showStatus(elements.scheduleStatus, "Scheduled check-ins paused.", "success");
      } catch (error) { elements.scheduleEnabled.classList.add("on"); elements.scheduleEnabled.setAttribute("aria-checked", "true"); showStatus(elements.scheduleStatus, error.message || "Could not pause check-ins."); }
    }
  });
  elements.scheduleForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const days = [...elements.scheduleDays.selectedOptions].map((option) => Number(option.value));
    try {
      await apiRequest("/api/workspace/schedule", { method: "PUT", auth: true, body: { enabled: elements.scheduleEnabled.getAttribute("aria-checked") === "true", channel: elements.scheduleChannel.value, time: elements.scheduleTime.value, timezone: elements.scheduleTimezone.value, days, quietStart: elements.scheduleQuietStart.value, quietEnd: elements.scheduleQuietEnd.value } });
      showStatus(elements.scheduleStatus, "Check-in schedule saved.", "success");
    } catch (error) { showStatus(elements.scheduleStatus, error.message || "Could not save the schedule."); }
  });

  elements.sessionList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-revoke-session]");
    if (!button) return;
    try {
      const response = await apiRequest(`/api/workspace/sessions/${button.dataset.revokeSession}`, { method: "DELETE", auth: true });
      if (response.current) { localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.assign("/login"); return; }
      await loadSessions();
    } catch (error) { showStatus(elements.status, error.message || "Could not revoke this session."); }
  });
  elements.revokeOthers?.addEventListener("click", async () => {
    if (!window.confirm("Sign out every other browser session?")) return;
    try { await apiRequest("/api/workspace/sessions", { method: "DELETE", auth: true }); await loadSessions(); }
    catch (error) { showStatus(elements.status, error.message || "Could not revoke other sessions."); }
  });

  elements.restorePreview?.addEventListener("click", async () => {
    const file = elements.restoreFile.files?.[0];
    if (!file) { showStatus(elements.restoreOutput, "Choose an Emora JSON export first."); return; }
    if (file.size > 2 * 1024 * 1024) { showStatus(elements.restoreOutput, "Keep restore files under 2 MB."); return; }
    try {
      state.restorePayload = JSON.parse(await file.text());
      const response = await apiRequest("/api/workspace/restore/preview", { method: "POST", auth: true, body: { export: state.restorePayload, mode: elements.restoreMode.value } });
      elements.restoreOutput.innerHTML = `<strong>Valid export.</strong> ${Object.entries(response.counts).map(([key, count]) => `${escapeHtml(key)}: ${count}`).join(" · ")}<br><span>No data has been changed.</span>`;
      elements.restoreCommit.hidden = false;
    } catch (error) { state.restorePayload = null; elements.restoreCommit.hidden = true; showStatus(elements.restoreOutput, error.message || "This export could not be validated."); }
  });
  elements.restoreCommit?.addEventListener("click", async () => {
    if (!state.restorePayload) return;
    const mode = elements.restoreMode.value;
    const confirmation = mode === "replace" ? window.prompt("Type REPLACE MY DATA to delete restorable server data before importing.") : "";
    if (mode === "replace" && confirmation !== "REPLACE MY DATA") return;
    try {
      const response = await apiRequest("/api/workspace/restore/commit", { method: "POST", auth: true, body: { export: state.restorePayload, mode, confirmation } });
      showStatus(elements.restoreOutput, `Restore complete. ${Object.values(response.written).reduce((sum, count) => sum + count, 0)} records written.`, "success");
      elements.restoreCommit.hidden = true; await loadPrivacySummary();
    } catch (error) { showStatus(elements.restoreOutput, error.message || "Restore failed without completing."); }
  });

  elements.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.busy) {
        return;
      }
      state.filter = button.dataset.avatarFilter || "all";
      renderFilterState();
      renderGallery();
    });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = elements.filterButtons.indexOf(button);
      const next = event.key === "Home" ? elements.filterButtons[0] : event.key === "End" ? elements.filterButtons.at(-1) : elements.filterButtons[(index + (event.key === "ArrowRight" ? 1 : -1) + elements.filterButtons.length) % elements.filterButtons.length];
      next.focus();
      next.click();
    });
  });

  elements.gallery?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-preset-id]") : null;
    if (!button) {
      return;
    }
    handlePresetSelection(button.dataset.presetId || "");
  });

  elements.uploadInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  });

  elements.accountExportButton?.addEventListener("click", async () => {
    try {
      const response = await fetch("/api/account/export", { headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } });
      if (!response.ok) throw new Error("Could not prepare your data export.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "emora-account-data.json";
      link.click();
      URL.revokeObjectURL(url);
      showStatus(elements.status, "Your account data export is ready.", "success");
    } catch (error) {
      showStatus(elements.status, error.message || "Could not export your data.");
    }
  });

  elements.clearHistoryButton?.addEventListener("click", async () => {
    if (!window.confirm("Permanently delete all saved conversations and attachments? This cannot be undone.")) return;
    try {
      const response = await apiRequest("/api/account/history", { method: "DELETE", auth: true });
      showStatus(elements.status, response.message, "success");
    } catch (error) {
      showStatus(elements.status, error.message || "Could not clear history.");
    }
  });

  elements.deleteAccountButton?.addEventListener("click", async () => {
    if (window.prompt("Type DELETE to permanently remove your account and all data.") !== "DELETE") return;
    try {
      await apiRequest("/api/account", { method: "DELETE", auth: true });
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.assign("/");
    } catch (error) {
      showStatus(elements.status, error.message || "Could not delete your account.");
    }
  });
}

async function loadPresets() {
  const response = await apiRequest("/api/auth/avatar-presets", { auth: true });
  state.presets = Array.isArray(response?.presets) ? response.presets : [];
}

async function loadPreferences() {
  const [response, space] = await Promise.all([apiRequest("/api/personal/preferences", { auth: true }), apiRequest("/api/experiences/space", { auth: true })]);
  state.preferences = response.preferences || {};
  state.preferenceVersion = response.version || 1;
  elements.preferenceButtons.forEach((button) => {
    const enabled = Boolean(state.preferences[button.dataset.profilePreference]);
    button.classList.toggle("on", enabled);
    button.setAttribute("aria-checked", String(enabled));
    button.disabled = false;
  });
  elements.preferenceSelects.forEach((select) => {
    select.value = state.preferences[select.dataset.profileSelect] || select.value;
    syncPreferenceSelectStyle(select);
  });
  applyAccessibility();
  if (elements.environmentSelect) {
    const labels = { midnight: "Midnight", dawn: "Dawn", "rainy-window": "Rainy Window", "quiet-forest": "Quiet Forest", "deep-ocean": "Deep Ocean", observatory: "Observatory", fireplace: "Fireplace", space: "Space", aurora: "Aurora" };
    elements.environmentSelect.innerHTML = (space.space?.available || []).map((name) => `<option value="${name}">${labels[name] || name}</option>`).join("");
    elements.environmentSelect.value = space.space?.environment || "midnight";
    elements.environmentSelect.dataset.current = elements.environmentSelect.value;
  }
}

async function loadSchedule() {
  if (!elements.scheduleForm) return;
  const { schedule } = await apiRequest("/api/workspace/schedule", { auth: true });
  elements.scheduleEnabled.classList.toggle("on", schedule.enabled); elements.scheduleEnabled.setAttribute("aria-checked", String(schedule.enabled));
  elements.scheduleChannel.value = schedule.channel; elements.scheduleTime.value = schedule.time; elements.scheduleTimezone.value = schedule.timezone;
  elements.scheduleQuietStart.value = schedule.quietStart; elements.scheduleQuietEnd.value = schedule.quietEnd;
  [...elements.scheduleDays.options].forEach((option) => { option.selected = schedule.days.includes(Number(option.value)); });
}

async function loadSessions() {
  if (!elements.sessionList) return;
  const response = await apiRequest("/api/workspace/sessions", { auth: true });
  elements.sessionList.innerHTML = response.sessions.length ? response.sessions.map((item) => `<article><div><strong>${escapeHtml(item.label)}${item.current ? " · This browser" : ""}</strong><span>Last active ${escapeHtml(formatDate(item.lastActivityAt))}</span></div><button class="btn btn-outline btn-sm" data-revoke-session="${escapeHtml(item.id)}">Sign out</button></article>`).join("") : "<p>No active sessions found.</p>";
  elements.securityEvents.innerHTML = response.events.length ? response.events.map((item) => `<article><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(formatDate(item.createdAt))}</span></article>`).join("") : "<p>No security activity recorded yet.</p>";
}

async function loadPrivacySummary() {
  if (!elements.privacyCounts) return;
  const response = await apiRequest("/api/workspace/privacy-summary", { auth: true });
  const labels = { conversations: "Conversations", journalEntries: "Journal entries", goals: "Goals", moments: "Moments", memories: "Memories", attachments: "Attachments", communityPosts: "Community posts", collections: "Collections", savedResearch: "Saved sources" };
  elements.privacyCounts.innerHTML = Object.entries(response.counts).map(([key, count]) => `<article><strong>${count}</strong><span>${escapeHtml(labels[key] || key)}</span></article>`).join("");
  elements.privacyStorage.innerHTML = `<div><strong>On this device</strong><p>${response.storage.deviceLocal.map(escapeHtml).join(" · ")}</p></div><div><strong>Synced to your account</strong><p>${response.storage.serverSynced.map(escapeHtml).join(" · ")}</p></div><p>${escapeHtml(response.retention.cameraFrames)} ${escapeHtml(response.retention.drafts)}</p>`;
}

async function loadProfileSummary() {
  const response = await apiRequest("/api/companion/dashboard", { auth: true });
  const dashboard = response.dashboard || {};
  const streak = Number(dashboard.dailyStreak || 0);
  const activeDays = Number(dashboard.conversationFrequency || 0);
  if (elements.streakBadge) elements.streakBadge.textContent = streak ? `${streak}-day rhythm` : "Rhythm starts with a check-in";
  if (elements.sessionBadge) elements.sessionBadge.textContent = activeDays ? `${activeDays} active day${activeDays === 1 ? "" : "s"} this week` : "No sessions this week";
}

(async () => {
  const session = await ensureSession({ redirectTo: "/login" });
  if (!session?.verified) {
    return;
  }

  state.user = getStoredUser();
  bindEvents();
  renderAllUserAvatars();
  renderCurrentMeta();
  renderFilterState();

  try {
    await Promise.all([loadPresets(), loadPreferences(), loadProfileSummary(), loadSchedule(), loadSessions(), loadPrivacySummary()]);
    renderGallery();
  } catch (error) {
    showStatus(elements.status, error.message || "Could not load profile settings.");
  }
})();
