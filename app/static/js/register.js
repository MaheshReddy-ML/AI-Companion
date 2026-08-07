import {
  apiRequest,
  ensureSession,
  initChrome,
  redirect,
  showStatus,
  storeSession,
} from "./common.js";

const form = document.getElementById("register-form");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("register-password");
const statusElement = document.getElementById("register-status");
const submitButton = document.getElementById("register-submit");
const togglePasswordButton = document.getElementById("register-toggle-password");
const googleSlot = document.getElementById("google-register-button");
const submitButtonLabel = submitButton.innerHTML;

initChrome();

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function consumeCallbackParameters() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (!token) {
    const queryError = params.get("error") || params.get("googleError");
    if (queryError) {
      showStatus(statusElement, decodeURIComponent(queryError), "error");
    }
    return false;
  }

  storeSession({
    token,
    user: {
      _id: params.get("userId") || "",
      email: params.get("email") || "",
      name: params.get("name") || "Google User",
    },
  });

  await ensureSession({ redirectTo: null });
  redirect("/dashboard");
  return true;
}

async function handleGoogleCredential(response) {
  showStatus(statusElement, "");

  if (!response?.credential) {
    showStatus(statusElement, "Google sign-up did not return an ID token.");
    return;
  }

  try {
    const payload = await apiRequest("/api/auth/google", {
      method: "POST",
      body: {
        token: response.credential,
      },
    });
    storeSession(payload);
    await ensureSession({ redirectTo: null });
    redirect("/dashboard");
  } catch (error) {
    showStatus(statusElement, error.message || "Google sign-up failed.");
  }
}

function initializeGoogleButton() {
  const clientId = window.APP_CONFIG?.googleClientId;
  if (!clientId) {
    googleSlot.innerHTML = '<p class="muted">Google sign-up is currently unavailable.</p>';
    return;
  }

  if (!window.google?.accounts?.id) {
    googleSlot.innerHTML = '<p class="muted">Google sign-up is temporarily unavailable.</p>';
    return;
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredential,
  });

  const width = Math.max(220, Math.min(360, Math.round(googleSlot.getBoundingClientRect().width || 280)));
  window.google.accounts.id.renderButton(googleSlot, {
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "signup_with",
    width,
  });
}

togglePasswordButton.addEventListener("click", () => {
  const nextType = passwordInput.type === "password" ? "text" : "password";
  passwordInput.type = nextType;
  togglePasswordButton.textContent = nextType === "password" ? "Show" : "Hide";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showStatus(statusElement, "");

  const name = nameInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!name) {
    showStatus(statusElement, "Full name is required.");
    return;
  }

  if (!email || !isValidEmail(email)) {
    showStatus(statusElement, "Enter a valid email address.");
    return;
  }

  if (password.length < 8) {
    showStatus(statusElement, "Password must be at least 8 characters.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Creating account...";

  try {
    const response = await apiRequest("/api/auth/register", {
      method: "POST",
      body: { name, email, password },
    });
    storeSession(response);
    await ensureSession({ redirectTo: null });
    redirect("/dashboard");
  } catch (error) {
    showStatus(statusElement, error.message || "Registration failed.");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = submitButtonLabel;
  }
});

(async () => {
  const handled = await consumeCallbackParameters();
  if (handled) {
    return;
  }

  // Keep this page usable on a shared device. A stored session should not
  // prevent someone from creating a separate account with a different email.
  await ensureSession({ redirectTo: null });

  if (document.readyState === "complete") {
    initializeGoogleButton();
  } else {
    window.addEventListener("load", initializeGoogleButton, { once: true });
  }
})();
