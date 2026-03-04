import { useState, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import Navbar from "../components/common/Navbar";
import { loginUser, googleLogin } from "../services/authService";
import { AuthContext } from "../context/AuthContext";

function buildDisplayName(identifier) {
  if (!identifier) {
    return "Mahesh";
  }

  if (identifier.includes("@")) {
    return identifier.split("@")[0];
  }

  return identifier.replace(/^user-?/i, "") || "Mahesh";
}

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  const persistSession = (payload, fallbackIdentifier) => {
    const rawUser = payload?.user ?? payload;
    const normalizedUser = {
      ...rawUser,
      name: rawUser?.name || rawUser?.username || buildDisplayName(fallbackIdentifier),
      email: rawUser?.email || `${buildDisplayName(fallbackIdentifier).toLowerCase()}@companion.demo`,
    };

    if (payload?.token) {
      localStorage.setItem("token", payload.token);
    }

    setUser(normalizedUser);
    navigate("/dashboard");
  };

  const handleDemoLogin = () => {
    const demoUser = {
      id: "demo-mahesh",
      name: "Mahesh",
      email: "mahesh@companion.demo",
      role: "demo",
    };

    localStorage.setItem("token", "demo-local-token");
    setUser(demoUser);
    navigate("/dashboard");
  };

  const handleLogin = async () => {
    const normalizedId = identifier.trim().toLowerCase();
    const isDemoUser = normalizedId === "mahesh" || normalizedId === "user-mahesh";
    const isDemoPassword = password === "mahesh" || password === "pass-mahesh";

    if (!identifier.trim() || !password.trim()) {
      setError("Enter username/email and password.");
      return;
    }

    if (isDemoUser && isDemoPassword) {
      setError("");
      handleDemoLogin();
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const data = await loginUser({ email: identifier.trim(), password });
      persistSession(data, identifier.trim());
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Try demo credentials: user-mahesh / pass-mahesh.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError("");
    const idToken = credentialResponse?.credential;

    if (!idToken) {
      setError("Google login did not return an ID token. Check OAuth client setup.");
      return;
    }

    try {
      const data = await googleLogin(idToken);
      persistSession(data, "mahesh");
    } catch (err) {
      const serverMessage = err.response?.data?.details || err.response?.data?.message;
      setError(serverMessage || "Google login failed. Verify Google client ID and allowed origins.");
    }
  };

  const handleGoogleFailure = () => {
    setError("Google popup failed. Verify OAuth client ID and authorized JavaScript origins.");
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter") {
      handleLogin();
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
              Continue where your
              <span className="gradient-text"> conversation left off</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              Full chat history stays available on your dashboard until you choose to delete it.
            </p>

            <div className="mt-6 space-y-3">
              <div className="feature-tile">
                <p className="text-sm font-semibold">Demo Access</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Username: <span className="font-bold">user-mahesh</span>
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Password: <span className="font-bold">pass-mahesh</span>
                </p>
              </div>
              <div className="feature-tile">
                <p className="text-sm font-semibold">Liquid-glass dashboard</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Readable chat flow tuned for long sessions.</p>
              </div>
              <div className="feature-tile">
                <p className="text-sm font-semibold">One-click sharing</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Send conversations to WhatsApp, X, and more apps.</p>
              </div>
            </div>
          </aside>

          <section className="p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Sign in</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Use your account or quick demo credentials.</p>
            </div>

            <div className="space-y-4">
              <label className="block text-sm">
                <span className="auth-label">Username or email</span>
                <input
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="user-mahesh"
                  className="auth-input"
                />
              </label>

              <label className="block text-sm">
                <span className="auth-label">Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="pass-mahesh"
                    className="auth-input pr-12"
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

              {error && <p className="status-banner error">{error}</p>}

              <button
                type="button"
                onClick={handleLogin}
                disabled={isSubmitting}
                className="primary-cta w-full rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIdentifier("user-mahesh");
                  setPassword("pass-mahesh");
                  setError("");
                }}
                className="secondary-cta w-full rounded-xl px-4 py-3 text-sm font-semibold"
              >
                Fill demo credentials
              </button>
            </div>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--border-soft)]" />
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">or continue with</span>
              <div className="h-px flex-1 bg-[var(--border-soft)]" />
            </div>

            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleFailure}
                shape="pill"
                text="continue_with"
                theme="outline"
                size="large"
              />
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
              <Link to="/forgot-password" className="transition hover:text-[var(--text-primary)]">
                Forgot password?
              </Link>
              <p>
                New here?{" "}
                <Link to="/register" className="font-semibold text-[var(--accent)] hover:underline">
                  Create account
                </Link>
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
