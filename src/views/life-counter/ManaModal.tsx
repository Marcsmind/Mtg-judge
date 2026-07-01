import React from "react";
import { BottomSheet } from "../../components/BottomSheet";
import type { Player, ManaKey } from "../../types/game";
import { Zap, X } from "lucide-react";

const MANA_PIPS: { key: ManaKey; label: string; sym: string; bg: string; border: string; text: string }[] = [
  { key: "W", label: "White",     sym: "W", bg: "rgba(245,215,150,0.15)", border: "rgba(245,215,150,0.45)", text: "#f0d870" },
  { key: "U", label: "Blue",      sym: "U", bg: "rgba(30,120,220,0.18)",  border: "rgba(60,140,255,0.45)",  text: "#5eaaff" },
  { key: "B", label: "Black",     sym: "B", bg: "rgba(80,60,100,0.25)",   border: "rgba(180,140,220,0.35)", text: "#c0a8e0" },
  { key: "R", label: "Red",       sym: "R", bg: "rgba(200,50,30,0.18)",   border: "rgba(240,80,50,0.45)",   text: "#ff6b50" },
  { key: "G", label: "Green",     sym: "G", bg: "rgba(30,140,60,0.18)",   border: "rgba(50,200,80,0.40)",   text: "#50d868" },
  { key: "C", label: "Colorless", sym: "C", bg: "rgba(100,100,120,0.18)", border: "rgba(180,180,200,0.35)", text: "#c0c0d0" },
];

interface ManaModalProps {
  targetPlayerId: number;
  players: Player[];
  onClose: () => void;
  adjustMana: (id: number, color: ManaKey, delta: number) => void;
  adjustStorm: (id: number, delta: number) => void;
  clearMana: (id: number) => void;
}

export const ManaModal: React.FC<ManaModalProps> = ({
  targetPlayerId, players, onClose, adjustMana, adjustStorm, clearMana,
}) => {
  const p = players.find(pl => pl.id === targetPlayerId);
  if (!p) return null;

  const totalMana = MANA_PIPS.reduce((sum, pip) => sum + (p.mana?.[pip.key] ?? 0), 0);
  const hasAnything = totalMana > 0 || (p.storm ?? 0) > 0;

  return (
    <BottomSheet onClose={onClose} zIndex={300} padding="20px" maxWidth="420px">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ background: "rgba(255,255,255,0.08)", padding: "8px", borderRadius: "10px", display: "flex" }}>
            <Zap size={22} color="var(--accent-purple)" />
          </div>
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>Mana Pool</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{p.name}</div>
          </div>
        </div>
        {hasAnything && (
          <button
            onClick={() => clearMana(p.id)}
            style={{
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "8px", padding: "6px 12px", cursor: "pointer",
              color: "#ef4444", fontSize: "0.72rem", fontWeight: 700,
              display: "flex", alignItems: "center", gap: "5px",
            }}
          >
            <X size={12} /> Clear All
          </button>
        )}
      </div>

      {/* Mana color grid — 3×2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
        {MANA_PIPS.map(({ key, label, sym, bg, border, text }) => {
          const count = p.mana?.[key] ?? 0;
          return (
            <div key={key} style={{
              background: bg, border: `1.5px solid ${border}`,
              borderRadius: "12px", padding: "12px 8px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
            }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: border, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.9rem", fontWeight: 900, color: "#fff",
              }}>
                {sym}
              </div>
              <div style={{ fontSize: "0.62rem", color: text, fontWeight: 600, letterSpacing: "0.5px" }}>{label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  onClick={() => adjustMana(p.id, key, -1)}
                  style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", width: "28px", height: "28px", borderRadius: "6px", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >−</button>
                <span style={{ fontSize: "1.4rem", fontWeight: 900, color: text, minWidth: "24px", textAlign: "center" }}>{count}</span>
                <button
                  onClick={() => adjustMana(p.id, key, 1)}
                  style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", width: "28px", height: "28px", borderRadius: "6px", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Storm Counter */}
      <div style={{
        background: "color-mix(in srgb, var(--accent-purple) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)",
        borderRadius: "12px", padding: "14px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>⛈ Storm Counter</div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>Copies spells cast this turn</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => adjustStorm(p.id, -1)} style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", width: "34px", height: "34px", borderRadius: "8px", fontSize: "1.2rem", fontWeight: 700, cursor: "pointer" }}>−</button>
          <span style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--accent-purple)", minWidth: "30px", textAlign: "center" }}>{p.storm ?? 0}</span>
          <button onClick={() => adjustStorm(p.id, 1)} style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", width: "34px", height: "34px", borderRadius: "8px", fontSize: "1.2rem", fontWeight: 700, cursor: "pointer" }}>+</button>
        </div>
      </div>
    </BottomSheet>
  );
};
