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
};

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
