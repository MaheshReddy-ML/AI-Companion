import {
  apiRequest,
  ensureSession,
  initChrome,
  redirect,
  showStatus,
  storeSession,
} from "./common.js";

const form = document.getElementById("login-form");
const identifierInput = document.getElementById("identifier");
const passwordInput = document.getElementById("password");
const statusElement = document.getElementById("login-status");
const submitButton = document.getElementById("login-submit");
const togglePasswordButton = document.getElementById("toggle-password");
const googleSlot = document.getElementById("google-login-button");
const submitButtonLabel = submitButton.innerHTML;

initChrome();

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

async function submitLogin(event) {
  event.preventDefault();
  showStatus(statusElement, "");

  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;

  if (!identifier || !password) {
    showStatus(statusElement, "Enter username/email and password.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Signing in...";

  try {
    const response = await apiRequest("/api/auth/login", {
      method: "POST",
      body: {
        email: identifier,
        password,
      },
    });
    storeSession(response);
    await ensureSession({ redirectTo: null });
    redirect("/dashboard");
  } catch (error) {
    showStatus(statusElement, error.message || "Login failed.");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = submitButtonLabel;
  }
}

async function handleGoogleCredential(response) {
  showStatus(statusElement, "");

  if (!response?.credential) {
    showStatus(statusElement, "Google login did not return an ID token.");
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
    showStatus(statusElement, error.message || "Google login failed.");
  }
}

function initializeGoogleButton() {
  const clientId = window.APP_CONFIG?.googleClientId;
  if (!clientId) {
    googleSlot.innerHTML = '<p class="muted">Google sign-in is currently unavailable.</p>';
    return;
  }

  if (!window.google?.accounts?.id) {
    googleSlot.innerHTML = '<p class="muted">Google sign-in is temporarily unavailable.</p>';
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
    text: "continue_with",
    width,
  });
}

togglePasswordButton.addEventListener("click", () => {
  const nextType = passwordInput.type === "password" ? "text" : "password";
  passwordInput.type = nextType;
  togglePasswordButton.textContent = nextType === "password" ? "Show" : "Hide";
});

form.addEventListener("submit", submitLogin);

(async () => {
  const handled = await consumeCallbackParameters();
  if (handled) {
    return;
  }

  const existingSession = await ensureSession({ redirectTo: null });
  if (existingSession?.verified) {
    redirect("/dashboard");
    return;
  }

  if (document.readyState === "complete") {
    initializeGoogleButton();
  } else {
    window.addEventListener("load", initializeGoogleButton, { once: true });
  }
})();
