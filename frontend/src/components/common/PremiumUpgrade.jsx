import { useState } from "react";

export default function PremiumUpgrade() {
  const [showModal, setShowModal] = useState(false);

  const premiumFeatures = [
    "Unlimited conversations",
    "Advanced analytics",
    "Priority support",
    "Custom themes",
    "Export conversations",
    "API access",
  ];

  const plans = [
    {
      name: "Monthly",
      price: "$9.99",
      period: "/month",
      description: "Cancel anytime",
      highlighted: false,
    },
    {
      name: "Yearly",
      price: "$79.99",
      period: "/year",
      description: "Save 33%",
      highlighted: true,
    },
  ];

  const handleUpgrade = (plan) => {
    // Here you would integrate with payment gateway
    alert(`Upgrading to ${plan.name} plan - ${plan.price}`);
    setShowModal(false);
  };

  return (
    <>
      {/* Upgrade Button in Header */}
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[#0d6d9b] px-4 py-2 text-xs font-bold text-white shadow-md transition hover:shadow-lg hover:scale-105"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>Upgrade</span>
      </button>

      {/* Premium Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-8 shadow-2xl">
            {/* Close Button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute right-6 top-6 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
              </svg>
            </button>

            {/* Header */}
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-[var(--text-primary)]">
                Upgrade to Premium
              </h2>
              <p className="mt-2 text-[var(--text-secondary)]">
                Unlock unlimited conversations and exclusive features
              </p>
            </div>

            {/* Features Grid */}
            <div className="mb-8 grid gap-3 sm:grid-cols-2">
              {premiumFeatures.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent)] to-[#0d6d9b]">
                    <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {feature}
                  </span>
                </div>
              ))}
            </div>

            {/* Pricing Plans */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2">
              {plans.map((plan, index) => (
                <div
                  key={index}
                  className={`relative rounded-2xl border-2 p-6 transition ${
                    plan.highlighted
                      ? "border-[var(--accent)] bg-gradient-to-br from-[var(--accent)]/10 to-transparent"
                      : "border-[var(--border-soft)] bg-[var(--bg-base)]"
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 transform">
                      <span className="inline-block rounded-full bg-gradient-to-r from-[var(--accent)] to-[#0d6d9b] px-3 py-1 text-xs font-bold text-white">
                        BEST VALUE
                      </span>
                    </div>
                  )}

                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    {plan.name}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {plan.description}
                  </p>

                  <div className="mt-4 mb-6">
                    <div className="flex items-baseline">
                      <span className="text-3xl font-bold text-[var(--text-primary)]">
                        {plan.price}
                      </span>
                      <span className="text-sm text-[var(--text-secondary)]">
                        {plan.period}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleUpgrade(plan)}
                    className={`w-full rounded-lg px-4 py-3 font-semibold transition ${
                      plan.highlighted
                        ? "bg-gradient-to-r from-[var(--accent)] to-[#0d6d9b] text-white hover:shadow-lg hover:scale-105"
                        : "border border-[var(--border-soft)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    {plan.highlighted ? "Get Started" : "Choose Plan"}
                  </button>
                </div>
              ))}
            </div>

            {/* Money-back guarantee */}
            <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-base)] px-4 py-3 text-center text-sm text-[var(--text-secondary)]">
              <svg className="h-5 w-5 text-[#1f9a73]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1C6.48 1 2 5.48 2 11s4.48 10 10 10 10-4.48 10-10S17.52 1 12 1zm-2 15l-5-5 1.41-1.41L10 13.17l7.59-7.59L19 7l-9 9z" />
              </svg>
              <span>30-day money-back guarantee. No questions asked.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
