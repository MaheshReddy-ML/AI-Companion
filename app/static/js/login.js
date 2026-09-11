import { initAuthFields, initializeGoogleSignIn } from "./auth-form.js";
import {
  apiRequest,
  ensureSession,
  initChrome,
  redirect,
  postAuthPath,
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
const validateFields = initAuthFields(form, togglePasswordButton, passwordInput);

const loginParams = new URLSearchParams(window.location.search);
if (loginParams.get("registered") === "1") {
  const registeredEmail = loginParams.get("email") || "";
  if (registeredEmail) identifierInput.value = registeredEmail;
  showStatus(statusElement, "Account created. Sign in with your new credentials.", "success");
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

async function submitLogin(event) {
  event.preventDefault();
  if (submitButton.disabled) return;
  showStatus(statusElement, "");

  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;

  if (!validateFields([
    [identifierInput, !identifier ? "Enter your email address." : !identifierInput.validity.valid ? "Enter a valid email address." : ""],
    [passwordInput, !password ? "Enter your password." : ""],
  ])) return;

  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");
  submitButton.textContent = "Signing in...";

  try {
    const response = await apiRequest("/api/auth/login", {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      body: {
        email: identifier,
        password,
      },
    });
    storeSession(response);
    await ensureSession({ redirectTo: null });
    redirect(postAuthPath());
  } catch (error) {
    showStatus(statusElement, (error.name === "TimeoutError" ? "Sign-in took too long. Please try again." : error.message) || "Login failed.");
  } finally {
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
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
      signal: AbortSignal.timeout(30000),
      body: {
        token: response.credential,
      },
    });
    storeSession(payload);
    await ensureSession({ redirectTo: null });
    redirect(postAuthPath());
  } catch (error) {
    showStatus(statusElement, error.message || "Google login failed.");
  }
}

function initializeGoogleButton() {
  initializeGoogleSignIn(googleSlot, handleGoogleCredential, "continue_with");
}

form.addEventListener("submit", submitLogin);

(async () => {
  const handled = await consumeCallbackParameters();
  if (handled) {
    return;
  }

  // A shared device may intentionally switch accounts; do not force an
  // existing local session back to the dashboard from the sign-in page.
  await ensureSession({ redirectTo: null });

  if (document.readyState === "complete") {
    initializeGoogleButton();
  } else {
    window.addEventListener("load", initializeGoogleButton, { once: true });
  }
})();
