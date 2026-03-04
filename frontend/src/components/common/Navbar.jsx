import { useContext } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeContext } from "../../context/ThemeContext";

function navLinkClass(active) {
  return `rounded-xl border px-3 py-2 text-sm font-semibold transition ${
    active
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
      : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
  }`;
}

export default function Navbar() {
  const location = useLocation();
  const themeCtx = useContext(ThemeContext);
  const theme = themeCtx?.theme ?? "system";
  const setTheme = themeCtx?.setTheme ?? (() => {});

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 z-40 px-4 py-4 sm:px-8">
      <div className="surface-glass navbar-shell mx-auto flex w-full max-w-7xl items-center justify-between rounded-2xl px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border-soft)] bg-[var(--glass-raised)]">
            <img src="/logo.svg" alt="AI Companion" className="h-6 w-6" />
          </span>
          <div>
            <p className="brand-title text-base font-bold">AI Companion</p>
            <p className="hidden text-xs text-[var(--text-secondary)] sm:block">Persistent, shareable conversations</p>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="secondary-cta rounded-xl px-3 py-2 text-xs font-semibold"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <Link to="/login" className={navLinkClass(location.pathname === "/login")}>Login</Link>
          <Link
            to="/register"
            className={
              location.pathname === "/register"
                ? "primary-cta rounded-xl px-4 py-2 text-sm font-semibold"
                : "secondary-cta rounded-xl px-4 py-2 text-sm font-semibold"
            }
          >
            Register
          </Link>
        </nav>
      </div>
    </header>
  );
}
