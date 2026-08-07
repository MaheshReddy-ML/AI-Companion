import { apiRequest, initChrome, redirect, showStatus } from "./common.js";

const params = new URLSearchParams(window.location.search);
const email = params.get("email") || "";

const emailLabel = document.getElementById("otp-email-label");
const form = document.getElementById("otp-form");
const otpInput = document.getElementById("otp-input");
const statusElement = document.getElementById("otp-status");
const submitButton = document.getElementById("otp-submit");
const resendButton = document.getElementById("otp-resend");

initChrome();

if (!email) {
  redirect("/forgot-password");
}

emailLabel.textContent = `We sent a code to ${email}.`;

let cooldown = 0;
let timerId = null;

function syncResendButton() {
  resendButton.disabled = cooldown > 0;
  resendButton.textContent = cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code";
}

function startCooldown(seconds) {
  cooldown = seconds;
  syncResendButton();

  if (timerId) {
    window.clearInterval(timerId);
  }

  timerId = window.setInterval(() => {
    cooldown = Math.max(cooldown - 1, 0);
    syncResendButton();
    if (cooldown === 0 && timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }, 1000);
}

otpInput.addEventListener("input", () => {
  otpInput.value = otpInput.value.replace(/\D+/g, "").slice(0, 6);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showStatus(statusElement, "");

  if (!otpInput.value.trim()) {
    showStatus(statusElement, "Enter the OTP code.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Verifying...";

  try {
    await apiRequest("/api/auth/verify-otp", {
      method: "POST",
      body: {
        email,
        otp: otpInput.value.trim(),
      },
    });
    redirect(`/reset-password?email=${encodeURIComponent(email)}`);
  } catch (error) {
    showStatus(statusElement, error.message || "Invalid OTP.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Verify code";
  }
});

resendButton.addEventListener("click", async () => {
  if (cooldown > 0) {
    return;
  }

  showStatus(statusElement, "");
  resendButton.disabled = true;
  resendButton.textContent = "Sending...";

  try {
    await apiRequest("/api/auth/send-otp", {
      method: "POST",
      body: { email },
    });
    showStatus(statusElement, "New code sent. Please check your inbox.", "success");
    startCooldown(30);
  } catch (error) {
    showStatus(statusElement, error.message || "Failed to resend OTP.");
  } finally {
    if (cooldown === 0) {
      resendButton.disabled = false;
      resendButton.textContent = "Resend code";
    }
  }
});
