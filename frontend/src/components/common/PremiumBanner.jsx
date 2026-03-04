import { useState } from "react";

export default function PremiumBanner({ onUpgradeClick }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-gradient-to-br from-[var(--accent)]/15 to-transparent p-4">
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[var(--accent)]/10 blur-2xl" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 flex-shrink-0 text-[var(--accent)]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="font-bold text-[var(--text-primary)]">Go Premium</h3>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              Unlock unlimited chats and advanced features. Get priority support.
            </p>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="flex-shrink-0 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>

        <button
          onClick={onUpgradeClick}
          className="mt-3 w-full rounded-lg bg-gradient-to-r from-[var(--accent)] to-[#0d6d9b] px-3 py-2 text-center text-xs font-bold text-white transition hover:shadow-md hover:scale-105"
        >
          Upgrade Now
        </button>
      </div>
    </div>
  );
}
