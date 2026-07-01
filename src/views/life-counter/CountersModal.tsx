import React from "react";
import { BottomSheet } from "../../components/BottomSheet";
import type { Player } from "../../types/game";
import { LayoutGrid, Crown, Swords, Star, Trash2 } from "lucide-react";

const RING_STAGES = [
  "Not tempted",
  "Bearer can't be blocked by power ≤ 2",
  "Bearer is legendary & gets protection",
  "Bearer draws a card when it attacks",
  "Bearer deals combat damage to players",
];

interface CounterDef {
  key: "generic" | "energy" | "poison" | "experience" | "ringLevel" | "storm" | "rad";
  label: string;
  emoji: string;
  color: string;
  max?: number;
}

const COUNTER_DEFS: CounterDef[] = [
  { key: "generic",    label: "Generic",    emoji: "⬡",  color: "#94a3b8" },
  { key: "energy",     label: "Energy",     emoji: "⚡", color: "#fbbf24" },
  { key: "poison",     label: "Poison",     emoji: "💀", color: "#10b981", max: 10 },
  { key: "experience", label: "Experience", emoji: "⭐", color: "#a78bfa" },
  { key: "ringLevel",  label: "The Ring",   emoji: "💍", color: "#c084fc", max: 4 },
  { key: "storm",      label: "Storm",      emoji: "⛈", color: "#818cf8" },
  { key: "rad",        label: "Radiation",  emoji: "☢️", color: "#84cc16" },
];

interface CountersModalProps {
  targetPlayerId: number;
  players: Player[];
  onClose: () => void;
  adjustCounter: (id: number, key: CounterDef["key"], delta: number) => void;
  assignMonarch: (id: number) => void;
  releaseMonarch: () => void;
  assignInitiative: (id: number) => void;
  releaseInitiative: () => void;
  toggleCityBlessing: (id: number) => void;
  clearCounters: (id: number) => void;
}

export const CountersModal: React.FC<CountersModalProps> = ({
  targetPlayerId, players, onClose,
  adjustCounter,
  assignMonarch, releaseMonarch,
  assignInitiative, releaseInitiative,
  toggleCityBlessing,
  clearCounters,
}) => {
  const p = players.find(pl => pl.id === targetPlayerId);
  if (!p) return null;

  const getValue = (key: CounterDef["key"]): number => {
    if (key === "rad") return p.rad ?? 0;
    return (p as unknown as Record<string, number>)[key] ?? 0;
  };

  const hasCounters = COUNTER_DEFS.some(d => getValue(d.key) > 0);
  const hasGameStates = p.isMonarch || p.hasInitiative || p.cityBlessing;

  return (
    <BottomSheet onClose={onClose} zIndex={300} padding="20px" maxWidth="420px">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ background: "rgba(255,255,255,0.08)", padding: "8px", borderRadius: "10px", display: "flex" }}>
            <LayoutGrid size={22} color="#06b6d4" />
          </div>
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>Counters</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{p.name}</div>
          </div>
        </div>
        {(hasCounters || hasGameStates) && (
          <button
            onClick={() => clearCounters(p.id)}
            style={{
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "8px", padding: "6px 12px", cursor: "pointer",
              color: "#ef4444", fontSize: "0.72rem", fontWeight: 700,
              display: "flex", alignItems: "center", gap: "5px",
            }}
          >
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      {/* Numeric counters */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
        {COUNTER_DEFS.map(({ key, label, emoji, color, max }) => {
          const val = getValue(key);
          const atMax = max !== undefined && val >= max;
          const subLabel = key === "ringLevel" ? RING_STAGES[val] : key === "poison" ? `${val}/10` : undefined;
          return (
            <div key={key} style={{
              display: "flex", alignItems: "center",
              background: val > 0 ? `${color}14` : "rgba(0,0,0,0.3)",
              border: `1px solid ${val > 0 ? `${color}50` : "rgba(255,255,255,0.07)"}`,
              borderRadius: "10px", padding: "10px 14px",
              transition: "background 0.15s, border-color 0.15s",
            }}>
              <span style={{ fontSize: "1.2rem", marginRight: "10px" }}>{emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: val > 0 ? color : "var(--text-secondary)" }}>{label}</div>
                {subLabel && <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "1px" }}>{subLabel}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  onClick={() => adjustCounter(p.id, key, -1)}
                  disabled={val <= 0}
                  style={{ background: "rgba(0,0,0,0.3)", border: "none", color: val > 0 ? "#fff" : "rgba(255,255,255,0.2)", width: "32px", height: "32px", borderRadius: "8px", fontSize: "1.1rem", fontWeight: 700, cursor: val > 0 ? "pointer" : "default" }}
                >−</button>
                <span style={{ fontSize: "1.3rem", fontWeight: 900, color: atMax ? "#ef4444" : (val > 0 ? color : "var(--text-muted)"), minWidth: "28px", textAlign: "center" }}>{val}</span>
                <button
                  onClick={() => adjustCounter(p.id, key, 1)}
                  disabled={atMax}
                  style={{ background: "rgba(0,0,0,0.3)", border: "none", color: atMax ? "rgba(255,255,255,0.2)" : "#fff", width: "32px", height: "32px", borderRadius: "8px", fontSize: "1.1rem", fontWeight: 700, cursor: atMax ? "default" : "pointer" }}
                >+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginBottom: "14px" }} />

      {/* Game state toggles */}
      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "10px" }}>Game States</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {/* Monarch */}
        <button
          onClick={() => p.isMonarch ? releaseMonarch() : assignMonarch(p.id)}
          style={{
            display: "flex", alignItems: "center", gap: "12px",
            background: p.isMonarch ? "rgba(234,179,8,0.15)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${p.isMonarch ? "rgba(234,179,8,0.4)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: "10px", padding: "12px 14px", cursor: "pointer", textAlign: "left",
          }}
        >
          <Crown size={18} color={p.isMonarch ? "#eab308" : "var(--text-muted)"} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: p.isMonarch ? "#eab308" : "var(--text-secondary)" }}>Monarch</div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{p.isMonarch ? "This player holds the crown" : "Tap to claim the Monarch"}</div>
          </div>
          <div style={{
            width: "20px", height: "20px", borderRadius: "50%",
            background: p.isMonarch ? "#eab308" : "rgba(255,255,255,0.1)",
            border: `2px solid ${p.isMonarch ? "#eab308" : "rgba(255,255,255,0.2)"}`,
          }} />
        </button>

        {/* Initiative */}
        <button
          onClick={() => p.hasInitiative ? releaseInitiative() : assignInitiative(p.id)}
          style={{
            display: "flex", alignItems: "center", gap: "12px",
            background: p.hasInitiative ? "rgba(6,182,212,0.15)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${p.hasInitiative ? "rgba(6,182,212,0.4)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: "10px", padding: "12px 14px", cursor: "pointer", textAlign: "left",
          }}
        >
          <Swords size={18} color={p.hasInitiative ? "#06b6d4" : "var(--text-muted)"} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: p.hasInitiative ? "#06b6d4" : "var(--text-secondary)" }}>Initiative</div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{p.hasInitiative ? "This player holds the Initiative" : "Tap to take the Initiative"}</div>
          </div>
          <div style={{
            width: "20px", height: "20px", borderRadius: "50%",
            background: p.hasInitiative ? "#06b6d4" : "rgba(255,255,255,0.1)",
            border: `2px solid ${p.hasInitiative ? "#06b6d4" : "rgba(255,255,255,0.2)"}`,
          }} />
        </button>

        {/* City's Blessing / Ascend */}
        <button
          onClick={() => toggleCityBlessing(p.id)}
          style={{
            display: "flex", alignItems: "center", gap: "12px",
            background: p.cityBlessing ? "rgba(234,179,8,0.10)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${p.cityBlessing ? "rgba(234,179,8,0.3)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: "10px", padding: "12px 14px", cursor: "pointer", textAlign: "left",
          }}
        >
          <Star size={18} fill={p.cityBlessing ? "#eab308" : "none"} color={p.cityBlessing ? "#eab308" : "var(--text-muted)"} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: p.cityBlessing ? "#eab308" : "var(--text-secondary)" }}>City's Blessing</div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{p.cityBlessing ? "Ascend achieved" : "Gain from Ascend (10+ permanents)"}</div>
          </div>
          <div style={{
            width: "20px", height: "20px", borderRadius: "50%",
            background: p.cityBlessing ? "#eab308" : "rgba(255,255,255,0.1)",
            border: `2px solid ${p.cityBlessing ? "#eab308" : "rgba(255,255,255,0.2)"}`,
          }} />
        </button>
      </div>
    </BottomSheet>
  );
};
