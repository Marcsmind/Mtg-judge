import React from "react";
import { X, Trophy, Skull, Swords, Shield, Crown } from "lucide-react";
import { BottomSheet } from "../../components/BottomSheet";
import type { Player } from "../../types/game";

interface GameSummaryModalProps {
  players: Player[];
  onClose: () => void;
}

const colors = {
  white:  { accent: "#d6ad60" },
  blue:   { accent: "#38bdf8" },
  black:  { accent: "#a855f7" },
  red:    { accent: "#ef4444" },
  green:  { accent: "#10b981" },
  purple: { accent: "#ec4899" },
};

export const GameSummaryModal: React.FC<GameSummaryModalProps> = ({ players, onClose }) => {

  // ── Computed stats ──

  /** Total commander damage dealt by each player (sum of dmg they inflicted on others) */
  const damageDealtBy: Record<number, number> = {};
  players.forEach(srcPlayer => {
    let total = 0;
    players.forEach(target => {
      Object.entries(target.commanderDamage).forEach(([key, dmg]) => {
        const srcId = parseInt(key.split("_")[0], 10);
        if (srcId === srcPlayer.id) total += dmg;
      });
    });
    damageDealtBy[srcPlayer.id] = total;
  });

  const sorted = [...players].sort((a, b) => b.life - a.life);

  const mvp = players.reduce<Player | null>((best, p) =>
    best === null || damageDealtBy[p.id] > damageDealtBy[best.id] ? p : best
  , null);

  const survivor = sorted[0]; // highest life

  return (
    <BottomSheet onClose={onClose} zIndex={200} maxWidth="560px">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Trophy size={22} color="#eab308" />
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>Game Summary</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close game summary"
            style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "4px" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-secondary)"}
          >
            <X size={20} />
          </button>
        </div>

        {/* Award badges */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {survivor && (
            <div style={{
              display: "flex", alignItems: "center", gap: "7px",
              background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: "20px", padding: "5px 12px",
            }}>
              <Crown size={14} color="var(--accent-emerald)" />
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-emerald)" }}>
                Survivor: {survivor.name}
              </span>
            </div>
          )}
          {mvp && damageDealtBy[mvp.id] > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: "7px",
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "20px", padding: "5px 12px",
            }}>
              <Swords size={14} color="var(--accent-rose)" />
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-rose)" }}>
                MVP: {mvp.name} ({damageDealtBy[mvp.id]} cmd dmg)
              </span>
            </div>
          )}
        </div>

        {/* Player rankings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h3 style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Final Standings
          </h3>
          {sorted.map((p, rank) => {
            const accent = colors[p.colorName]?.accent ?? "#ec4899";
            const totalTax = p.tax + (p.partnerMode ? p.taxPartner : 0);
            const cmdDmgDealt = damageDealtBy[p.id];
            const cmdDmgTaken = Object.values(p.commanderDamage).reduce((s, v) => s + v, 0);
            const isDead = p.life <= 0 || (p.poison ?? 0) >= 10 || cmdDmgTaken >= 21;
            return (
              <div
                key={p.id}
                style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  background: rank === 0 ? "rgba(234,179,8,0.07)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${rank === 0 ? "rgba(234,179,8,0.25)" : "rgba(255,255,255,0.05)"}`,
                  borderRadius: "10px", padding: "10px 14px",
                }}
              >
                {/* Rank */}
                <span style={{
                  width: "22px", textAlign: "center",
                  fontSize: "0.9rem", fontWeight: 800,
                  color: rank === 0 ? "#eab308" : rank === 1 ? "#94a3b8" : "var(--text-muted)",
                }}>
                  #{rank + 1}
                </span>

                {/* Color dot */}
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: accent, flexShrink: 0 }} />

                {/* Name */}
                <span style={{ flex: 1, fontWeight: 700, fontSize: "0.9rem", color: isDead ? "var(--text-muted)" : "var(--text-primary)" }}>
                  {p.name}
                  {isDead && <span style={{ fontSize: "0.65rem", color: "var(--accent-rose)", marginLeft: "6px" }}>DEFEATED</span>}
                </span>

                {/* Life */}
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "1.1rem", fontWeight: 900, color: p.life <= 0 ? "var(--accent-rose)" : "#fff" }}>{p.life}</span>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>life</span>
                </div>

                {/* Stats row */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  {totalTax > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "3px" }} title="Commander Tax">
                      <Shield size={11} color="var(--text-muted)" />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Tax {totalTax}</span>
                    </div>
                  )}
                  {cmdDmgDealt > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "3px" }} title="Commander Damage dealt">
                      <Swords size={11} color={accent} />
                      <span style={{ fontSize: "0.72rem", color: accent }}>{cmdDmgDealt}</span>
                    </div>
                  )}
                  {(p.poison ?? 0) > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "3px" }} title="Poison counters">
                      <Skull size={11} color="#10b981" />
                      <span style={{ fontSize: "0.72rem", color: "#10b981" }}>{p.poison}/10</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
};
