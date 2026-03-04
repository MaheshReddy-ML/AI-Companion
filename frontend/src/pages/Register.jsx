import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import { registerUser } from "../services/authService";

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  const handleRegister = async () => {
    setNameError("");
    setEmailError("");
    setPasswordError("");
    setGeneralError("");

    let isValid = true;

    if (!name.trim()) {
      setNameError("Full name is required.");
      isValid = false;
    }

    if (!email.trim()) {
      setEmailError("Email is required.");
      isValid = false;
    } else if (!validateEmail(email.trim())) {
      setEmailError("Please enter a valid email address.");
      isValid = false;
    }

    if (!password) {
      setPasswordError("Password is required.");
      isValid = false;
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters long.");
      isValid = false;
    }

    if (!isValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await registerUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      navigate("/login");
    } catch (err) {
      const message = err.response?.data?.message || "Registration failed.";

      if (message.toLowerCase().includes("exists")) {
        setEmailError("This email is already registered.");
      } else {
        setGeneralError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleRegister();
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
              Build your
              <span className="gradient-text"> companion workspace</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              Create your account and keep every planning session accessible, organized, and share-ready.
            </p>

            <div className="mt-6 space-y-3">
              <div className="feature-tile">
                <p className="text-sm font-semibold">Session persistence</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Conversations remain available until you remove them.</p>
              </div>
              <div className="feature-tile">
                <p className="text-sm font-semibold">Conversation sharing</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Quickly send updates to WhatsApp, X, or system share sheets.</p>
              </div>
              <div className="feature-tile">
                <p className="text-sm font-semibold">Responsive by default</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Optimized composition and chat readability on mobile and desktop.</p>
              </div>
            </div>
          </aside>

          <section className="p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Create account</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Start your personalized AI companion experience.</p>
            </div>

            <div className="space-y-4">
              <label>
                <span className="auth-label">Full name</span>
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (nameError) {
                      setNameError("");
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Your full name"
                  className={`auth-input ${nameError ? "auth-input-error" : ""}`}
                />
                {nameError && <p className="mt-1 text-xs text-[var(--danger)]">{nameError}</p>}
              </label>

              <label>
                <span className="auth-label">Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailError) {
                      setEmailError("");
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="name@example.com"
                  className={`auth-input ${emailError ? "auth-input-error" : ""}`}
                />
                {emailError && <p className="mt-1 text-xs text-[var(--danger)]">{emailError}</p>}
              </label>

              <label>
                <span className="auth-label">Password</span>
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
                {passwordError && <p className="mt-1 text-xs text-[var(--danger)]">{passwordError}</p>}
              </label>

              {generalError && <p className="status-banner error">{generalError}</p>}

              <button
                type="button"
                onClick={handleRegister}
                disabled={isSubmitting}
                className="primary-cta w-full rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Creating account..." : "Create Account"}
              </button>
            </div>

            <div className="mt-7 text-sm text-[var(--text-secondary)]">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-[var(--accent)] hover:underline">
                Log in
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
