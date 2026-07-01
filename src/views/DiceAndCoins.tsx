import React, { useState } from "react";
import { ArrowLeft, Coins, Shuffle, Swords, SlidersHorizontal, Info, Trash2, ChevronRight } from "lucide-react";
import type { Player } from "../types/game";
import { useDiceActions, type DiceLastResult } from "../hooks/useDiceActions";
import { DiceIcon } from "../components/DiceIcon";

interface DiceAndCoinsProps {
  onClose?: () => void;
  players?: Player[];
  myPlayerIndex?: number | null;
  diceActions?: ReturnType<typeof useDiceActions>;
}

const DICE_TYPES = [
  { name: "d4",  sides: 4,  color: "var(--accent-rose)"    },
  { name: "d6",  sides: 6,  color: "var(--accent-emerald)" },
  { name: "d8",  sides: 8,  color: "var(--accent-cyan)"    },
  { name: "d10", sides: 10, color: "var(--accent-gold)"    },
  { name: "d12", sides: 12, color: "var(--accent-purple)"  },
  { name: "d20", sides: 20, color: "var(--accent-purple)"  },
];

function describeResultText(r: DiceLastResult): string {
  if (r.kind === "coin") return `Coin flip: ${r.outcome}`;
  if (r.kind === "player") return `${r.mode === "opponent" ? "Random opponent" : "Random player"}: ${r.name}`;
  const breakdown = r.count > 1 ? ` [${r.breakdown.join(" + ")}]` : "";
  return `${r.count > 1 ? `${r.count}×` : ""}${r.name}: ${r.value}${breakdown}`;
}

const ResultIcon: React.FC<{ r: DiceLastResult; size?: number }> = ({ r, size = 24 }) => {
  if (r.kind === "dice") return <DiceIcon sides={r.sides} size={size} color="var(--accent-purple)" />;
  if (r.kind === "coin") return <Coins size={size} color="var(--accent-gold)" />;
  return r.mode === "opponent"
    ? <Swords size={size} color="var(--accent-rose)" />
    : <Shuffle size={size} color="var(--accent-purple)" />;
};

export const DiceAndCoins: React.FC<DiceAndCoinsProps> = ({ onClose, players = [], myPlayerIndex = null, diceActions }) => {
  const ownActions = useDiceActions(players, myPlayerIndex);
  const { history, lastResult, rollingKeys, flipCoin, rollDie, randomizePlayer, clearHistory } = diceActions ?? ownActions;

  const [customSides, setCustomSides] = useState(7);
  const [customOpen, setCustomOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleCustomRoll = () => {
    const sides = Math.max(2, Math.min(1000, customSides || 2));
    rollDie(`d${sides}`, sides);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", maxHeight: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 16px 12px", borderBottom: "1px solid var(--border-color)", flexShrink: 0 }}>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Back"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "4px", display: "flex" }}
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Dice &amp; Misc</h2>
      </div>

      <div style={{ overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Last result banner */}
        {lastResult && (
          <div className="glass-panel" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", background: "color-mix(in srgb, var(--accent-purple) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 25%, transparent)" }}>
            <ResultIcon r={lastResult} size={26} />
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{describeResultText(lastResult)}</span>
          </div>
        )}

        {/* Randomize rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={() => randomizePlayer("any")}
            disabled={players.length === 0}
            style={{
              display: "flex", alignItems: "center", gap: "12px", width: "100%",
              background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-color)",
              borderRadius: "12px", padding: "12px 14px", cursor: players.length === 0 ? "not-allowed" : "pointer",
              opacity: players.length === 0 ? 0.5 : 1,
            }}
          >
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "color-mix(in srgb, var(--accent-purple) 15%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Shuffle size={18} color="var(--accent-purple)" />
            </div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>Randomize player</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Pick someone at the table at random</div>
            </div>
            <ChevronRight size={18} color="var(--text-muted)" />
          </button>

          <button
            onClick={() => randomizePlayer("opponent")}
            disabled={players.length === 0}
            style={{
              display: "flex", alignItems: "center", gap: "12px", width: "100%",
              background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-color)",
              borderRadius: "12px", padding: "12px 14px", cursor: players.length === 0 ? "not-allowed" : "pointer",
              opacity: players.length === 0 ? 0.5 : 1,
            }}
          >
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Swords size={18} color="var(--accent-rose)" />
            </div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>Randomize opponent</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Pick a random opponent, excluding you</div>
            </div>
            <ChevronRight size={18} color="var(--text-muted)" />
          </button>
        </div>

        {/* Coins & Dice */}
        <div>
          <h3 style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
            Coins &amp; Dice
          </h3>

          {/* Flip Coin + Custom Roller */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <button
              onClick={flipCoin}
              className="glass-button"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "16px 10px", background: "rgba(234,179,8,0.06)", borderColor: "rgba(234,179,8,0.25)" }}
            >
              <Coins size={24} color="var(--accent-gold)" className={rollingKeys.has("coin") ? "anim-coin" : undefined} />
              <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>Flip Coin</span>
            </button>

            <button
              onClick={() => setCustomOpen(o => !o)}
              className="glass-button"
              aria-expanded={customOpen}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "16px 10px", background: "rgba(6,182,212,0.06)", borderColor: "rgba(6,182,212,0.25)" }}
            >
              <SlidersHorizontal size={24} color="var(--accent-cyan)" />
              <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>Custom Roller</span>
            </button>
          </div>

          {customOpen && (
            <div className="glass-panel" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Sides:</span>
              <input
                type="number"
                min={2}
                max={1000}
                value={customSides}
                onChange={e => setCustomSides(parseInt(e.target.value, 10) || 2)}
                style={{
                  width: "70px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-color)",
                  borderRadius: "8px", padding: "6px 8px", color: "#fff", fontSize: "0.9rem",
                }}
              />
              <button onClick={handleCustomRoll} className="glass-button" style={{ marginLeft: "auto", padding: "8px 18px" }}>
                Roll
              </button>
            </div>
          )}

          {/* Dice grid: 3x2 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {DICE_TYPES.map(d => (
              <button
                key={d.name}
                onClick={() => rollDie(d.name, d.sides)}
                aria-label={`Roll ${d.name}`}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px",
                  padding: "16px 8px", borderRadius: "12px", cursor: "pointer",
                  background: "rgba(255,255,255,0.02)", border: `1px solid ${d.color}40`,
                  boxShadow: `0 0 14px ${d.color}1a`,
                }}
              >
                <DiceIcon sides={d.sides} size={26} color={d.color} rolling={rollingKeys.has(`dice:${d.name}:1`)} />
                <span style={{ fontWeight: 800, fontSize: "0.85rem", color: d.color }}>{d.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick access info callout */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px",
          borderRadius: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-color)",
        }}>
          <Info size={16} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: "2px" }} />
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
            <strong style={{ color: "var(--text-primary)" }}>Quick access:</strong> hold the dice button on the life counter bar for instant access to all dice and randomizers.
          </div>
        </div>

        {/* Recent rolls (collapsible) */}
        {history.length > 0 && (
          <div>
            <button
              onClick={() => setHistoryOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                background: "none", border: "none", cursor: "pointer", padding: "4px 0", color: "var(--text-secondary)",
              }}
            >
              <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Recent ({history.length})
              </span>
              <ChevronRight size={16} style={{ transform: historyOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }} />
            </button>
            {historyOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                {history.slice(0, 12).map(log => (
                  <div
                    key={log.id}
                    style={{
                      fontSize: "0.75rem", padding: "8px 10px", borderRadius: "8px",
                      background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{log.label}</span>
                      <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>{log.time}</span>
                    </div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--accent-purple)" }}>{log.result}</span>
                  </div>
                ))}
                <button
                  onClick={clearHistory}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                    background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                    fontSize: "0.75rem", padding: "6px",
                  }}
                >
                  <Trash2 size={12} /> Clear history
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Close button */}
      {onClose && (
        <div style={{ padding: "12px 16px 16px", flexShrink: 0 }}>
          <button onClick={onClose} className="glass-button" style={{ width: "100%", padding: "12px" }}>
            Close
          </button>
        </div>
      )}
    </div>
  );
};
