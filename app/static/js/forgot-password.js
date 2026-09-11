import { apiRequest, initChrome, redirect, showStatus } from "./common.js";

const form = document.getElementById("forgot-form");
const emailInput = document.getElementById("forgot-email");
const statusElement = document.getElementById("forgot-status");
const submitButton = document.getElementById("forgot-submit");
const submitButtonLabel = submitButton.innerHTML;

initChrome();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showStatus(statusElement, "");

  const email = emailInput.value.trim().toLowerCase();
  if (!email) {
    showStatus(statusElement, "Please enter your email address.");
    return;
  }

  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");
  submitButton.textContent = "Sending...";

  try {
    await apiRequest("/api/auth/send-otp", {
      method: "POST",
      body: { email },
    });
    redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
  } catch (error) {
    showStatus(statusElement, error.message || "Failed to send OTP.");
  } finally {
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
    submitButton.innerHTML = submitButtonLabel;
  }
});
