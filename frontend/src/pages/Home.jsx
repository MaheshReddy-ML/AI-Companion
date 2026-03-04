import { useNavigate } from "react-router-dom";
import Navbar from "../components/common/Navbar";

const featureCards = [
  {
    title: "Memory That Sticks",
    description: "Every conversation remains in your dashboard after refresh and across sessions until you remove it.",
    metric: "100% retained",
  },
  {
    title: "Fast Sharing",
    description: "Share complete chat threads to WhatsApp, X, or your device share sheet in one click.",
    metric: "3 channels",
  },
  {
    title: "Pin + Organize",
    description: "Pin critical conversations so high-priority threads always stay visible at the top.",
    metric: "ChatGPT-style",
  },
  {
    title: "Fluid Experience",
    description: "A liquid-glass interface tuned for long sessions with strong contrast and clean hierarchy.",
    metric: "Desktop + Mobile",
  },
];

const workflow = [
  {
    step: "01",
    title: "Start Conversation",
    description: "Open a fresh chat and drop a goal, question, or task that you need help with.",
  },
  {
    step: "02",
    title: "Shape The Output",
    description: "Use prompts, file attachments, and follow-ups to refine actionable responses.",
  },
  {
    step: "03",
    title: "Save, Pin, Share",
    description: "Keep important chats, pin priorities, and share updates without leaving the dashboard.",
  },
];

const liveStats = [
  { label: "Persisted chats", value: "∞" },
  { label: "Share targets", value: "3" },
  { label: "UI latency", value: "Fast" },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="landing-grid relative min-h-screen overflow-hidden text-[var(--text-primary)]">
      <div className="liquid-orb liquid-orb-a" />
      <div className="liquid-orb liquid-orb-b" />
      <div className="liquid-orb liquid-orb-c" />

      <Navbar />

      <main className="relative px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
        <section className="mx-auto grid w-full max-w-7xl items-start gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="float-up space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--glass-raised)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
              Companion v2 experience
            </div>

            <div className="space-y-5">
              <h1 className="text-4xl font-bold leading-[1.02] sm:text-5xl lg:text-6xl">
                A premium AI workspace for
                <span className="gradient-text"> focused conversations</span>
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
                Designed from Home to Dashboard for clarity, persistence, and fast collaboration. Open, pin, and share important chats without losing context.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="primary-cta rounded-2xl px-6 py-3 text-sm font-bold sm:text-base"
              >
                Launch Companion
              </button>
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="secondary-cta rounded-2xl px-6 py-3 text-sm font-bold sm:text-base"
              >
                Create Account
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {liveStats.map((item) => (
                <div key={item.label} className="hero-metric-card rounded-2xl border border-[var(--border-soft)] bg-[var(--glass-raised)] p-3">
                  <p className="text-xs uppercase tracking-[0.11em] text-[var(--text-secondary)]">{item.label}</p>
                  <p className="mt-1 text-2xl font-bold">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="surface-glass max-w-2xl rounded-2xl p-4 sm:p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Demo login</p>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p className="rounded-xl border border-[var(--border-soft)] bg-[var(--glass-raised)] px-3 py-2">
                  Username: <span className="font-bold">user-mahesh</span>
                </p>
                <p className="rounded-xl border border-[var(--border-soft)] bg-[var(--glass-raised)] px-3 py-2">
                  Password: <span className="font-bold">pass-mahesh</span>
                </p>
              </div>
            </div>
          </div>

          <div className="surface-glass float-up home-command-center rounded-3xl p-4 [animation-delay:120ms] sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border-soft)] pb-3">
              <div>
                <p className="brand-title text-sm font-bold">Dashboard Preview</p>
                <p className="text-xs text-[var(--text-secondary)]">Pinned + shared + saved chats</p>
              </div>
              <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">Live</span>
            </div>

            <div className="space-y-3">
              <div className="chat-shell rounded-2xl p-3">
                <p className="text-xs uppercase tracking-[0.1em] text-[var(--text-secondary)]">Pinned</p>
                <p className="mt-1 text-sm font-semibold">Sprint planning • Shared to WhatsApp</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Updated 2m ago</p>
              </div>

              <div className="message-bubble assistant">
                I prepared your final summary and pinned the conversation for tomorrow.
              </div>
              <div className="ml-auto message-bubble user">
                Great. Share it to X and keep this at the top.
              </div>
              <div className="message-bubble assistant">
                Done. It stays saved in dashboard until you manually delete it.
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-14 w-full max-w-7xl">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Feature set</p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">Built for daily AI workflows</h2>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {featureCards.map((feature, index) => (
              <article key={feature.title} className="feature-tile float-up h-full" style={{ animationDelay: `${index * 70 + 80}ms` }}>
                <p className="text-xs font-semibold uppercase tracking-[0.11em] text-[var(--accent)]">{feature.metric}</p>
                <h3 className="mt-2 text-lg font-bold leading-tight">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-14 w-full max-w-7xl">
          <div className="surface-glass rounded-3xl p-5 sm:p-7">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Workflow</p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">From idea to shared outcome</h2>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {workflow.map((item) => (
                <article key={item.step} className="rounded-2xl border border-[var(--border-soft)] bg-[var(--glass-raised)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Step {item.step}</p>
                  <h3 className="mt-2 text-lg font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{item.description}</p>
                </article>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--glass-raised)] px-4 py-3">
              <p className="text-sm text-[var(--text-secondary)]">Ready to move into the dashboard and start your first pinned conversation?</p>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="primary-cta rounded-xl px-4 py-2 text-sm font-bold"
              >
                Go to Login
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
