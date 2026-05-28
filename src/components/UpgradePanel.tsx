import React, { useState } from "react";
import { Crown, Zap, Check, Sparkles, Clock } from "lucide-react";
import type { SubscriptionTier } from "../types/subscription";
import type { AuthUser } from "../services/auth";

interface UpgradePanelProps {
  tier: SubscriptionTier;
  authUser: AuthUser | null;
  trialEndsAt?: string | null;
}

type PriceType = "pro_monthly" | "pro_annual" | "lifetime";

async function startCheckout(priceType: PriceType, userId: string, userEmail?: string) {
  const res = await fetch("/.netlify/functions/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceType, userId, userEmail }),
  });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
  else console.error("[upgrade] checkout failed:", data);
}

const PRO_FEATURES = [
  "Host 3–6 player Commander pods",
  "Unlimited AI Judge questions",
  "Cloud deck sync across devices",
  "Unlimited deck storage",
  "AI deck generation & analysis",
  "Full game history & leaderboard",
  "Per-deck commander win rate",
];

export const UpgradePanel: React.FC<UpgradePanelProps> = ({ tier, authUser, trialEndsAt }) => {
  const [loading, setLoading] = useState<PriceType | null>(null);

  const daysLeftInTrial = (() => {
    if (!trialEndsAt) return null;
    const ms = new Date(trialEndsAt).getTime() - Date.now();
    if (ms <= 0) return null;
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  })();

  const isTrial = tier === "pro" && daysLeftInTrial !== null;

  const handleUpgrade = async (priceType: PriceType) => {
    if (!authUser || authUser.isAnonymous) return;
    setLoading(priceType);
    try {
      await startCheckout(priceType, authUser.id, authUser.email);
    } finally {
      setLoading(null);
    }
  };

  // ── Active Pro or Lifetime ───────────────────────────────────────────────
  if (tier === "lifetime") {
    return (
      <div className="glass-panel" style={{ padding: "24px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Sparkles size={22} color="var(--accent-gold)" />
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Lifetime Access</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>You have permanent access to all Pro features. Thank you for being a Founder!</p>
          </div>
        </div>
      </div>
    );
  }

  if (tier === "pro" && !isTrial) {
    return (
      <div className="glass-panel" style={{ padding: "24px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Crown size={22} color="var(--accent-purple)" />
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Pro Active</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              All Pro features unlocked.{" "}
              <a href="https://billing.stripe.com/p/login/test_00g00000000000000000" target="_blank" rel="noreferrer" style={{ color: "var(--accent-cyan)", textDecoration: "none" }}>
                Manage subscription →
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Anonymous user — prompt to sign in first ─────────────────────────────
  if (!authUser || authUser.isAnonymous) {
    return (
      <div className="glass-panel" style={{ padding: "24px 30px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Crown size={22} color="var(--accent-purple)" />
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Upgrade to Pro</h3>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.55 }}>
          Create a free account first, then upgrade to unlock the full Commander experience.
        </p>
      </div>
    );
  }

  // ── Free user or trial user — show pricing ───────────────────────────────
  return (
    <div className="glass-panel" style={{ padding: "30px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Crown size={22} color="var(--accent-purple)" />
        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            {isTrial ? "Pro Trial Active" : "Upgrade to Pro"}
          </h3>
          {isTrial && daysLeftInTrial !== null && (
            <p style={{ color: "var(--accent-gold)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "5px" }}>
              <Clock size={13} />
              {daysLeftInTrial} day{daysLeftInTrial !== 1 ? "s" : ""} left in your free trial
            </p>
          )}
          {!isTrial && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>The full Commander AI companion.</p>
          )}
        </div>
      </div>

      {/* Feature list */}
      <ul style={{ display: "flex", flexDirection: "column", gap: "8px", padding: 0, margin: 0, listStyle: "none" }}>
        {PRO_FEATURES.map(f => (
          <li key={f} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.88rem", color: "var(--text-secondary)" }}>
            <Check size={14} color="var(--accent-emerald)" style={{ flexShrink: 0 }} />
            {f}
          </li>
        ))}
      </ul>

      {/* Pricing cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
        {/* Monthly */}
        <button
          onClick={() => handleUpgrade("pro_monthly")}
          disabled={loading !== null}
          className="glass-button"
          style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px", padding: "16px", opacity: loading === "pro_monthly" ? 0.7 : 1 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "0.9rem" }}>
            <Zap size={14} color="var(--accent-purple)" />
            Monthly
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>$4.99</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>per month</div>
          {loading === "pro_monthly" && <div style={{ fontSize: "0.75rem", color: "var(--accent-purple)" }}>Redirecting…</div>}
        </button>

        {/* Annual */}
        <button
          onClick={() => handleUpgrade("pro_annual")}
          disabled={loading !== null}
          className="glass-button"
          style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px", padding: "16px", border: "1.5px solid rgba(139,92,246,0.4)", position: "relative", opacity: loading === "pro_annual" ? 0.7 : 1 }}
        >
          <div style={{ position: "absolute", top: "-10px", right: "10px", background: "var(--accent-emerald)", color: "#fff", fontSize: "0.68rem", fontWeight: 700, padding: "2px 7px", borderRadius: "10px" }}>
            SAVE 42%
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "0.9rem" }}>
            <Crown size={14} color="var(--accent-purple)" />
            Annual
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>$34.99</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>per year · $2.92/mo</div>
          {loading === "pro_annual" && <div style={{ fontSize: "0.75rem", color: "var(--accent-purple)" }}>Redirecting…</div>}
        </button>

        {/* Lifetime */}
        <button
          onClick={() => handleUpgrade("lifetime")}
          disabled={loading !== null}
          className="glass-button"
          style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px", padding: "16px", border: "1.5px solid rgba(234,179,8,0.3)", opacity: loading === "lifetime" ? 0.7 : 1 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "0.9rem", color: "var(--accent-gold)" }}>
            <Sparkles size={14} />
            Lifetime
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>$79.99</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>one-time · Founder pricing</div>
          {loading === "lifetime" && <div style={{ fontSize: "0.75rem", color: "var(--accent-gold)" }}>Redirecting…</div>}
        </button>
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" }}>
        Secure checkout via Stripe. Cancel anytime. No hidden fees.
      </p>
    </div>
  );
};
