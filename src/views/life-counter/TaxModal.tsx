import React from "react";
import { BottomSheet } from "../../components/BottomSheet";
import type { Player } from "../../types/game";
import { Crown, Plus, Minus, UserPlus } from "lucide-react";

interface TaxModalProps {
  targetPlayerId: number;
  players: Player[];
  onClose: () => void;
  adjustTax: (id: number, isPartner: boolean, delta: number) => void;
  togglePartner: (id: number) => void;
}

export const TaxModal: React.FC<TaxModalProps> = ({
  targetPlayerId,
  players,
  onClose,
  adjustTax,
  togglePartner,
}) => {
  const targetPlayer = players.find(p => p.id === targetPlayerId);
  if (!targetPlayer) return null;

  return (
    <BottomSheet onClose={onClose} zIndex={300} padding="24px" maxWidth="400px">
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", color: "var(--text-primary)" }}>
        <div style={{ background: "rgba(255,255,255,0.1)", padding: "8px", borderRadius: "12px", display: "flex" }}>
          <Crown size={24} color="var(--accent-purple)" />
        </div>
        <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>Commander Tax → {targetPlayer.name}</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        
        {/* Main Commander Tax */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(0,0,0,0.4)", border: "1px solid rgba(168,85,247,0.5)",
          borderRadius: "12px", padding: "12px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>Commander</span>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button 
              onClick={() => adjustTax(targetPlayer.id, false, -2)}
              style={{ 
                background: "rgba(255,255,255,0.1)", border: "none", color: "var(--text-primary)", 
                width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" 
              }}
            >
              <Minus size={18} />
            </button>
            <span style={{ fontSize: "1.4rem", fontWeight: 900, color: "#a855f7", minWidth: "28px", textAlign: "center" }}>
              {targetPlayer.tax}
            </span>
            <button 
              onClick={() => adjustTax(targetPlayer.id, false, 2)}
              style={{ 
                background: "rgba(255,255,255,0.1)", border: "none", color: "var(--text-primary)", 
                width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" 
              }}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Partner Toggle */}
        <button
          onClick={() => togglePartner(targetPlayer.id)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            background: targetPlayer.partnerMode ? "var(--accent-purple)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${targetPlayer.partnerMode ? "var(--accent-purple)" : "rgba(255,255,255,0.1)"}`,
            color: targetPlayer.partnerMode ? "#fff" : "var(--text-muted)",
            padding: "10px", borderRadius: "10px", cursor: "pointer", fontWeight: 700, marginTop: "8px",
            transition: "all 0.2s"
          }}
        >
          <UserPlus size={16} />
          {targetPlayer.partnerMode ? "Partner Mode Enabled" : "Enable Partner Mode"}
        </button>

        {/* Partner Tax */}
        {targetPlayer.partnerMode && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "rgba(0,0,0,0.4)", border: "1px solid rgba(168,85,247,0.5)",
            borderRadius: "12px", padding: "12px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>Partner</span>
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button 
                onClick={() => adjustTax(targetPlayer.id, true, -2)}
                style={{ 
                  background: "rgba(255,255,255,0.1)", border: "none", color: "var(--text-primary)", 
                  width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" 
                }}
              >
                <Minus size={18} />
              </button>
              <span style={{ fontSize: "1.4rem", fontWeight: 900, color: "#a855f7", minWidth: "28px", textAlign: "center" }}>
                {targetPlayer.taxPartner}
              </span>
              <button 
                onClick={() => adjustTax(targetPlayer.id, true, 2)}
                style={{ 
                  background: "rgba(255,255,255,0.1)", border: "none", color: "var(--text-primary)", 
                  width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" 
                }}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        )}

      </div>
    </BottomSheet>
  );
};
