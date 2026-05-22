import React from "react";
import { X } from "lucide-react";
import type { Player } from "../../types/game";
import { BottomSheet } from "../../components/BottomSheet";

type ColorName = "white" | "blue" | "black" | "red" | "green" | "purple";

interface ColorTheme {
  bg: string;
  accent: string;
  border: string;
}

interface CommanderDamageModalProps {
  targetPlayer: Player;
  allPlayers: Player[];
  colors: Record<ColorName, ColorTheme>;
  onAdjust: (targetId: number, sourceId: number, suffix: string, amount: number) => void;
  onClose: () => void;
}

export const CommanderDamageModal: React.FC<CommanderDamageModalProps> = ({
  targetPlayer,
  allPlayers,
  colors,
  onAdjust,
  onClose,
}) => {
  return (
    <BottomSheet
      onClose={onClose}
      zIndex={80}
      maxWidth="500px"
      role="dialog"
      aria-modal={true}
      aria-label={`Commander Damage for ${targetPlayer.name}`}
    >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700 }}>
              Commander Damage → {targetPlayer.name}
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
              21+ from one commander = loss.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close commander damage editor"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-muted)")
            }
          >
            <X size={18} />
          </button>
        </div>

        {/* Damage rows */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            maxHeight: "420px",
            overflowY: "auto",
          }}
        >
          {allPlayers
            .filter((sp) => sp.id !== targetPlayer.id)
            .map((src) => {
              const sTheme = colors[src.colorName] || colors.purple;

              const renderBlock = (suffix: string, label: string) => {
                const key = `${src.id}${suffix}`;
                const dmg = targetPlayer.commanderDamage[key] ?? 0;
                const pct = Math.min(100, (dmg / 21) * 100);
                return (
                  <div
                    key={key}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: "10px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span
                          style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            background: sTheme.accent,
                            display: "block",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                          {label}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "1rem",
                          fontWeight: 800,
                          color:
                            dmg >= 21
                              ? "var(--accent-rose)"
                              : "var(--text-primary)",
                        }}
                      >
                        {dmg} / 21
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div
                      style={{
                        height: "4px",
                        width: "100%",
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: "2px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background:
                            dmg >= 21 ? "var(--accent-rose)" : sTheme.accent,
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>

                    {/* Adjustment buttons */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "6px",
                      }}
                    >
                      {[-1, 1, 5].map((amt) => (
                        <button
                          key={amt}
                          onClick={() =>
                            onAdjust(targetPlayer.id, src.id, suffix, amt)
                          }
                          disabled={amt < 0 && dmg === 0}
                          style={{
                            width: "36px",
                            height: "30px",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "6px",
                            cursor:
                              amt < 0 && dmg === 0
                                ? "not-allowed"
                                : "pointer",
                            color: "#fff",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            opacity: amt < 0 && dmg === 0 ? 0.3 : 1,
                          }}
                        >
                          {amt > 0 ? `+${amt}` : amt}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              };

              return (
                <div key={src.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {renderBlock("", `${src.name}'s Commander`)}
                  {src.partnerMode && renderBlock("_B", `${src.name}'s Partner`)}
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
          <button
            onClick={onClose}
            className="glass-button"
            style={{
              background: "var(--accent-purple)",
              borderColor: "var(--accent-purple)",
              color: "#fff",
              padding: "8px 22px",
            }}
          >
            Save &amp; Close
          </button>
        </div>
    </BottomSheet>
  );
};
