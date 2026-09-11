import { initAuthFields, initializeGoogleSignIn } from "./auth-form.js";
import {
  apiRequest,
  clearSession,
  ensureSession,
  initChrome,
  redirect,
  postAuthPath,
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
const validateFields = initAuthFields(form, togglePasswordButton, passwordInput);

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function consumeCallbackParameters() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (!token) {
    const queryError = params.get("error") || params.get("googleError");
    if (queryError) {
      showStatus(statusElement, queryError, "error");
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
  redirect(postAuthPath());
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
      signal: AbortSignal.timeout(30000),
      body: {
        token: response.credential,
      },
    });
    storeSession(payload);
    await ensureSession({ redirectTo: null });
    redirect(postAuthPath());
  } catch (error) {
    showStatus(statusElement, error.message || "Google sign-up failed.");
  }
}

function initializeGoogleButton() {
  initializeGoogleSignIn(googleSlot, handleGoogleCredential, "signup_with");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitButton.disabled) return;
  showStatus(statusElement, "");

  const name = nameInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!validateFields([
    [nameInput, !name ? "Enter your name." : ""],
    [emailInput, !isValidEmail(email) ? "Enter a valid email address." : ""],
    [passwordInput, password.length < 8 ? "Use at least 8 characters for your password." : ""],
  ])) return;

  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");
  submitButton.textContent = "Creating account...";

  try {
    await apiRequest("/api/auth/register", {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      body: { name, email, password },
    });
    clearSession();
    redirect(`/login?registered=1&email=${encodeURIComponent(email)}`);
  } catch (error) {
    showStatus(statusElement, (error.name === "TimeoutError" ? "The request timed out. Try signing in before registering again." : error.message) || "Registration failed.");
  } finally {
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
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
