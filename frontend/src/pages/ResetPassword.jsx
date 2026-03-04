import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import { resetPassword } from "../services/authService";

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!email) {
      navigate("/forgot-password", { replace: true });
    }
  }, [email, navigate]);

  if (!email) {
    return null;
  }

  const handleReset = async () => {
    setError("");
    setPasswordError("");

    if (!password) {
      setPasswordError("Password is required.");
      return;
    }

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword({
        email,
        newPassword: password,
      });
      navigate("/login");
    } catch (err) {
      setError(err?.response?.data?.message || "Password reset failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleReset();
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
              Create a new
              <span className="gradient-text"> secure password</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              Use at least 8 characters and avoid reusing old passwords for better account safety.
            </p>
          </aside>

          <section className="p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Set new password</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Update password for <span className="font-semibold text-[var(--text-primary)]">{email}</span>.
              </p>
            </div>

            <div className="space-y-4">
              <label>
                <span className="auth-label">New password</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (passwordError) {
                        setPasswordError("");
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="At least 8 characters"
                    className={`auth-input pr-12 ${passwordError ? "auth-input-error" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--accent-soft)]"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <label>
                <span className="auth-label">Confirm password</span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    if (passwordError) {
                      setPasswordError("");
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Re-enter password"
                  className={`auth-input ${passwordError ? "auth-input-error" : ""}`}
                />
              </label>

              {passwordError && <p className="status-banner error">{passwordError}</p>}
              {error && <p className="status-banner error">{error}</p>}

              <button
                type="button"
                onClick={handleReset}
                disabled={isSubmitting}
                className="primary-cta w-full rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Resetting..." : "Reset password"}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
