import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import { sendOtp } from "../services/authService";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSendOtp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await sendOtp({ email: trimmedEmail });
      navigate("/verify-otp", { state: { email: trimmedEmail } });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleSendOtp();
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
              Recover access with
              <span className="gradient-text"> secure OTP verification</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              We will send a one-time code to your email. After verification, you can create a new password.
            </p>
          </aside>

          <section className="p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Forgot password</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Enter your registered email and we will send a verification code.
              </p>
            </div>

            <div className="space-y-4">
              <label>
                <span className="auth-label">Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) {
                      setError("");
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="name@example.com"
                  className={`auth-input ${error ? "auth-input-error" : ""}`}
                />
              </label>

              {error && <p className="status-banner error">{error}</p>}

              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading}
                className="primary-cta w-full rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Sending..." : "Send OTP"}
              </button>

              <button
                type="button"
                onClick={() => navigate("/login")}
                className="secondary-cta w-full rounded-xl px-4 py-3 text-sm font-semibold"
              >
                Back to login
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
