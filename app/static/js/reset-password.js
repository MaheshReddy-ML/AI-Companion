import { apiRequest, initChrome, redirect, showStatus } from "./common.js";

const params = new URLSearchParams(window.location.search);
const email = params.get("email") || "";

const emailLabel = document.getElementById("reset-email-label");
const form = document.getElementById("reset-form");
const passwordInput = document.getElementById("reset-password");
const confirmPasswordInput = document.getElementById("reset-confirm-password");
const statusElement = document.getElementById("reset-status");
const submitButton = document.getElementById("reset-submit");
const togglePasswordButton = document.getElementById("reset-toggle-password");

initChrome();

if (!email) {
  redirect("/forgot-password");
}

emailLabel.textContent = `Resetting password for ${email}.`;

togglePasswordButton.addEventListener("click", () => {
  const nextType = passwordInput.type === "password" ? "text" : "password";
  passwordInput.type = nextType;
  confirmPasswordInput.type = nextType;
  togglePasswordButton.textContent = nextType === "password" ? "Show" : "Hide";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showStatus(statusElement, "");

  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (password.length < 8) {
    showStatus(statusElement, "Password must be at least 8 characters.");
    return;
  }

  if (password !== confirmPassword) {
    showStatus(statusElement, "Passwords do not match.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Resetting...";

  try {
    await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: {
        email,
        newPassword: password,
      },
    });
    redirect("/login");
  } catch (error) {
    showStatus(statusElement, error.message || "Password reset failed.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Reset password";
  }
});
