import React, { useState, useEffect } from "react";
import { X, Camera, Zap, Check } from "lucide-react";
import { track } from "../services/analytics";
import {
  isNative,
  getOffering,
  purchasePackage,
  restorePurchases,
  type RCOffering,
  type RCPackage,
} from "../services/revenueCat";
import type { SubscriptionTier } from "../types/subscription";

interface ScannerPaywallProps {
  onClose: () => void;
  onUnlocked: () => void;
  onTierChange: (t: SubscriptionTier) => void;
  variant?: 'gate' | 'limit-reached';  // 'gate' = entry, 'limit-reached' = after 5th scan
}

const PERKS = [
  "Auto-scan cards by pointing your camera",
  "Identify any card from any set instantly",
  "Build your collection without typing a name",
  "Foil detection & printing picker included",
];

export const ScannerPaywall: React.FC<ScannerPaywallProps> = ({ onClose, onUnlocked, onTierChange, variant = 'gate' }) => {
  const [offering,  setOffering]  = useState<RCOffering | null>(null);
  const [selected,  setSelected]  = useState<"monthly" | "annual" | "lifetime">("annual");
  const [loading,   setLoading]   = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    track("scanner_paywall_shown", {});
    if (isNative) getOffering().then(setOffering);
  }, []);

  const pkg = (): RCPackage | null => {
    if (!offering) return null;
    return offering[selected] ?? null;
  };

  const handlePurchase = async () => {
    const p = pkg();
    if (!p || loading) return;
    setLoading(true);
    setError(null);
    track("scanner_paywall_purchase_started", { plan: selected });
    const tier = await purchasePackage(p);
    setLoading(false);
    if (tier && tier !== "free") {
      onTierChange(tier);
      track("scanner_paywall_purchase_success", { plan: selected, tier });
      onUnlocked();
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const tier = await restorePurchases();
    setRestoring(false);
    if (tier && tier !== "free") {
      onTierChange(tier);
      track("scanner_paywall_restore_success", { tier });
      onUnlocked();
    } else {
      setError("No previous purchases found.");
    }
  };

  const prices: Record<"monthly" | "annual" | "lifetime", { label: string; sub: string; highlight?: string }> = {
    monthly:  { label: offering?.monthly?.priceString  ?? "$5.99",  sub: "per month" },
    annual:   { label: offering?.annual?.priceString   ?? "$34.99", sub: "per year", highlight: "Best value" },
    lifetime: { label: offering?.lifetime?.priceString ?? "$79.99", sub: "one-time" },
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, #1a1030 0%, #0e0c1a 100%)",
          borderRadius: "24px 24px 0 0",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 28px)",
          overflow: "hidden",
        }}
      >
        {/* Purple accent bar */}
        <div style={{ height: "4px", background: "linear-gradient(90deg, #7c3aed, #06b6d4)" }} />

        <div style={{ padding: "20px 22px 0" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                width: "46px", height: "46px", borderRadius: "14px", flexShrink: 0,
                background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.2))",
                border: "1px solid rgba(124,58,237,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Camera size={22} color="#a78bfa" />
              </div>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem", lineHeight: 1.2 }}>
                  {variant === 'limit-reached' ? "Free scans used up" : "Card Scanner"}
                </div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.78rem", marginTop: "2px" }}>
                  {variant === 'limit-reached' ? "Upgrade to keep scanning" : "Pro feature"}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "8px", padding: "7px", cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex" }}>
              <X size={16} />
            </button>
          </div>

          {/* Perks */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "22px" }}>
            {PERKS.map((perk, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={11} color="#a78bfa" strokeWidth={3} />
                </div>
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.88rem" }}>{perk}</span>
              </div>
            ))}
          </div>

          {/* Plan selector */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {(["annual", "monthly", "lifetime"] as const).map(plan => {
              const p = prices[plan];
              const active = selected === plan;
              return (
                <button
                  key={plan}
                  onClick={() => setSelected(plan)}
                  style={{
                    flex: 1, padding: "10px 6px", borderRadius: "12px", cursor: "pointer",
                    border: active ? "2px solid #7c3aed" : "2px solid rgba(255,255,255,0.1)",
                    background: active ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.04)",
                    position: "relative", overflow: "hidden",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  {p.highlight && (
                    <div style={{
                      position: "absolute", top: "0", left: "0", right: "0",
                      background: "#7c3aed", fontSize: "0.6rem", fontWeight: 800,
                      color: "#fff", letterSpacing: "0.5px", padding: "2px 0", textAlign: "center",
                    }}>
                      {p.highlight.toUpperCase()}
                    </div>
                  )}
                  <div style={{ marginTop: p.highlight ? "10px" : "0" }}>
                    <div style={{ color: active ? "#e9d5ff" : "#fff", fontWeight: 800, fontSize: "0.92rem" }}>{p.label}</div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.68rem", marginTop: "2px" }}>{p.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {error && (
            <div style={{ color: "#f87171", fontSize: "0.8rem", textAlign: "center", marginBottom: "10px" }}>{error}</div>
          )}

          {/* CTA */}
          <button
            onClick={handlePurchase}
            disabled={loading || !isNative}
            style={{
              width: "100%", padding: "15px", borderRadius: "14px", border: "none",
              background: loading ? "rgba(124,58,237,0.4)" : "linear-gradient(135deg, #7c3aed, #6d28d9)",
              color: "#fff", fontSize: "1rem", fontWeight: 800, cursor: loading ? "default" : "pointer",
              boxShadow: loading ? "none" : "0 4px 20px rgba(124,58,237,0.5)",
              transition: "opacity 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            }}
          >
            {loading ? "Processing…" : (
              <>
                <Zap size={17} fill="#fff" />
                Unlock Scanner — {prices[selected].label}
              </>
            )}
          </button>

          {/* Restore */}
          <button
            onClick={handleRestore}
            disabled={restoring}
            style={{
              width: "100%", marginTop: "12px", padding: "10px",
              background: "transparent", border: "none",
              color: "rgba(255,255,255,0.35)", fontSize: "0.78rem",
              cursor: "pointer",
            }}
          >
            {restoring ? "Restoring…" : "Restore previous purchase"}
          </button>
        </div>
      </div>
    </div>
  );
};
