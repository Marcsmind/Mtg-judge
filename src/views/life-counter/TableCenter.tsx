import React, { useState, useRef, useEffect } from "react";
import { Crown, Swords, User } from "lucide-react";
import type { Player } from "../../types/game";

interface TableCenterProps {
  players: Player[];
  assignMonarch: (id: number) => void;
  releaseMonarch: () => void;
  assignInitiative: (id: number) => void;
  releaseInitiative: () => void;
  hasMonarchMechanic: boolean;
  hasInitiativeMechanic: boolean;
}

export const TableCenter: React.FC<TableCenterProps> = ({
  players, assignMonarch, releaseMonarch, assignInitiative, releaseInitiative,
  hasMonarchMechanic, hasInitiativeMechanic
}) => {
  const monarchPlayer = players.find(p => p.isMonarch);
  const initiativePlayer = players.find(p => p.hasInitiative);

  const [monarchMenuOpen, setMonarchMenuOpen] = useState(false);
  const [initMenuOpen, setInitMenuOpen] = useState(false);

  const monarchRef = useRef<HTMLDivElement>(null);
  const initRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (monarchRef.current && !monarchRef.current.contains(e.target as Node)) setMonarchMenuOpen(false);
      if (initRef.current && !initRef.current.contains(e.target as Node)) setInitMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!hasMonarchMechanic && !hasInitiativeMechanic) return null;

  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "8px", justifyContent: "center" }}>
      
      {/* ── Monarch Banner ── */}
      {hasMonarchMechanic && (
        <div ref={monarchRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMonarchMenuOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)",
              borderRadius: "12px", padding: "6px 14px", cursor: "pointer",
              color: "#eab308", fontWeight: 700, fontSize: "0.85rem",
              boxShadow: monarchPlayer ? "0 0 16px rgba(234,179,8,0.2)" : "none",
              transition: "all 0.2s ease",
            }}
          >
            <Crown size={16} />
            <span>Monarch: {monarchPlayer ? monarchPlayer.name : "Unclaimed"}</span>
          </button>
          
          {monarchMenuOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
              background: "rgba(12,9,20,0.95)", border: "1px solid rgba(234,179,8,0.3)",
              borderRadius: "12px", padding: "8px", zIndex: 50, display: "flex", flexDirection: "column", gap: "4px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)", minWidth: "160px",
            }}>
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textAlign: "center", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
                Assign Monarch
              </div>
              {monarchPlayer && (
                <button
                  onClick={() => { releaseMonarch(); setMonarchMenuOpen(false); }}
                  style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "0.8rem", padding: "6px", cursor: "pointer", textAlign: "left", borderRadius: "6px" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                >
                  Unclaim
                </button>
              )}
              {players.map(p => (
                <button
                  key={p.id}
                  onClick={() => { assignMonarch(p.id); setMonarchMenuOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    background: p.isMonarch ? "rgba(234,179,8,0.2)" : "none",
                    border: "none", color: p.isMonarch ? "#eab308" : "#fff",
                    fontSize: "0.8rem", padding: "6px", cursor: "pointer", textAlign: "left", borderRadius: "6px",
                  }}
                  onMouseEnter={e => { if (!p.isMonarch) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { if (!p.isMonarch) e.currentTarget.style.background = "none"; }}
                >
                  <User size={14} /> {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Initiative Banner ── */}
      {hasInitiativeMechanic && (
        <div ref={initRef} style={{ position: "relative" }}>
          <button
            onClick={() => setInitMenuOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)",
              borderRadius: "12px", padding: "6px 14px", cursor: "pointer",
              color: "#06b6d4", fontWeight: 700, fontSize: "0.85rem",
              boxShadow: initiativePlayer ? "0 0 16px rgba(6,182,212,0.2)" : "none",
              transition: "all 0.2s ease",
            }}
          >
            <Swords size={16} />
            <span>Initiative: {initiativePlayer ? initiativePlayer.name : "Unclaimed"}</span>
          </button>
          
          {initMenuOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
              background: "rgba(12,9,20,0.95)", border: "1px solid rgba(6,182,212,0.3)",
              borderRadius: "12px", padding: "8px", zIndex: 50, display: "flex", flexDirection: "column", gap: "4px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)", minWidth: "160px",
            }}>
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textAlign: "center", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
                Assign Initiative
              </div>
              {initiativePlayer && (
                <button
                  onClick={() => { releaseInitiative(); setInitMenuOpen(false); }}
                  style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "0.8rem", padding: "6px", cursor: "pointer", textAlign: "left", borderRadius: "6px" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                >
                  Unclaim
                </button>
              )}
              {players.map(p => (
                <button
                  key={p.id}
                  onClick={() => { assignInitiative(p.id); setInitMenuOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    background: p.hasInitiative ? "rgba(6,182,212,0.2)" : "none",
                    border: "none", color: p.hasInitiative ? "#06b6d4" : "#fff",
                    fontSize: "0.8rem", padding: "6px", cursor: "pointer", textAlign: "left", borderRadius: "6px",
                  }}
                  onMouseEnter={e => { if (!p.hasInitiative) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { if (!p.hasInitiative) e.currentTarget.style.background = "none"; }}
                >
                  <User size={14} /> {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
