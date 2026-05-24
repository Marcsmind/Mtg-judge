import React from "react";
import { BottomSheet } from "../../components/BottomSheet";
import type { Player, TokenKey } from "../../types/game";
import { Coins } from "lucide-react";

// eslint-disable-next-line react-refresh/only-export-components
export const TOKEN_TYPES: { key: TokenKey; label: string; emoji: string; color: string }[] = [
  { key: "treasure", label: "Treasure", emoji: "🪙", color: "#eab308" },
  { key: "food",     label: "Food",     emoji: "🍎", color: "#10b981" },
  { key: "clue",     label: "Clue",     emoji: "🔍", color: "#06b6d4" },
  { key: "blood",    label: "Blood",    emoji: "🩸", color: "#f43f5e" },
  { key: "rad",      label: "Radiation",emoji: "☢️", color: "#84cc16" },
];

interface TokenModalProps {
  targetPlayerId: number;
  players: Player[];
  onClose: () => void;
  adjustToken: (id: number, key: TokenKey, delta: number) => void;
}

export const TokenModal: React.FC<TokenModalProps> = ({
  targetPlayerId,
  players,
  onClose,
  adjustToken,
}) => {
  const targetPlayer = players.find(p => p.id === targetPlayerId);
  if (!targetPlayer) return null;

  return (
    <BottomSheet onClose={onClose} zIndex={300} padding="24px" maxWidth="400px">
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", color: "var(--text-primary)" }}>
        <div style={{ background: "rgba(255,255,255,0.1)", padding: "8px", borderRadius: "12px", display: "flex" }}>
          <Coins size={24} color="#eab308" />
        </div>
        <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>Tokens → {targetPlayer.name}</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {TOKEN_TYPES.map(({ key, label, emoji, color }) => {
          const count = targetPlayer.tokens?.[key] ?? 0;
          return (
            <div key={key} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "rgba(0,0,0,0.4)", border: `1px solid ${color}50`,
              borderRadius: "12px", padding: "12px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.4rem" }}>{emoji}</span>
                <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>{label}</span>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button 
                  onClick={() => adjustToken(targetPlayer.id, key, -1)}
                  style={{ 
                    background: "rgba(255,255,255,0.1)", border: "none", color: "var(--text-primary)", 
                    width: "36px", height: "36px", borderRadius: "8px", fontSize: "1.2rem", fontWeight: 800, cursor: "pointer" 
                  }}
                >
                  −
                </button>
                <span style={{ fontSize: "1.4rem", fontWeight: 900, color, minWidth: "28px", textAlign: "center" }}>
                  {count}
                </span>
                <button 
                  onClick={() => adjustToken(targetPlayer.id, key, 1)}
                  style={{ 
                    background: "rgba(255,255,255,0.1)", border: "none", color: "var(--text-primary)", 
                    width: "36px", height: "36px", borderRadius: "8px", fontSize: "1.2rem", fontWeight: 800, cursor: "pointer" 
                  }}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
};
