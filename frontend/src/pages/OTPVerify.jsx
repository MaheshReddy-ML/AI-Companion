import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import { verifyOtp, sendOtp } from "../services/authService";

export default function OTPVerify() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!email) {
      navigate("/forgot-password", { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (cooldown <= 0) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setCooldown((previous) => Math.max(previous - 1, 0));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [cooldown]);

  if (!email) {
    return null;
  }

  const handleVerify = async () => {
    if (!otp.trim()) {
      setError("Enter the OTP code.");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);

    try {
      await verifyOtp({ email, otp: otp.trim() });
      navigate("/reset-password", { state: { email } });
    } catch (err) {
      setError(err?.response?.data?.message || "Invalid OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) {
      return;
    }

    setError("");
    setMessage("");
    setResending(true);

    try {
      await sendOtp({ email });
      setMessage("New code sent. Please check your inbox.");
      setCooldown(30);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to resend OTP.");
    } finally {
      setResending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleVerify();
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-bg-wave" />
      <Navbar />

      <main className="relative px-4 pb-12 pt-6 sm:px-8">
        <div className="auth-card mx-auto grid w-full max-w-5xl overflow-hidden lg:grid-cols-[0.95fr_1.05fr]">
          <aside className="hidden border-r border-[var(--border-soft)] p-8 lg:block">
            <h1 className="text-3xl font-bold leading-tight">
              Verify your identity
              <span className="gradient-text"> before resetting password</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              Enter the one-time code sent to your inbox. Codes expire quickly for better security.
            </p>
          </aside>

          <section className="p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Verify OTP</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                We sent a code to <span className="font-semibold text-[var(--text-primary)]">{email}</span>.
              </p>
            </div>

            <div className="space-y-4">
              <label>
                <span className="auth-label">One-time password</span>
                <input
                  type="text"
                  value={otp}
                  onChange={(event) => {
                    const nextValue = event.target.value.replace(/\D+/g, "").slice(0, 6);
                    setOtp(nextValue);
                    if (error) {
                      setError("");
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter 6-digit code"
                  className={`auth-input text-center text-lg tracking-[0.35em] ${error ? "auth-input-error" : ""}`}
                  maxLength={6}
                />
              </label>

              {error && <p className="status-banner error">{error}</p>}
              {message && <p className="status-banner success">{message}</p>}

              <button
                type="button"
                onClick={handleVerify}
                disabled={loading}
                className="primary-cta w-full rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Verifying..." : "Verify code"}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="secondary-cta w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resending ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
