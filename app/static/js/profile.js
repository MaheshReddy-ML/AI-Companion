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
};

const PREFERENCE_PREFIX = "ai-companion:profile-preference:";

const state = {
  presets: [],
  filter: "all",
  user: null,
  busy: false,
};

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
}

function renderFilterState() {
  elements.filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.avatarFilter === state.filter);
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
    const stored = key ? localStorage.getItem(`${PREFERENCE_PREFIX}${key}`) : null;
    const enabled = stored === null ? button.classList.contains("on") : stored === "true";
    button.classList.toggle("on", enabled);
    button.setAttribute("aria-checked", String(enabled));
    button.addEventListener("click", () => {
      const nextValue = !button.classList.contains("on");
      button.classList.toggle("on", nextValue);
      button.setAttribute("aria-checked", String(nextValue));
      if (key) localStorage.setItem(`${PREFERENCE_PREFIX}${key}`, String(nextValue));
      button.animate([{ transform: "scale(.82)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 360, easing: "cubic-bezier(.2,.9,.25,1)" });
      showStatus(elements.status, `${button.getAttribute("aria-label")?.replace("Toggle ", "") || "Preference"} ${nextValue ? "enabled" : "paused"} on this device.`, "success");
    });
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
    await loadPresets();
    renderGallery();
  } catch (error) {
    showStatus(elements.status, error.message || "Could not load avatar presets.");
  }
})();
