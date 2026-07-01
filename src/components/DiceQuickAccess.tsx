import React from "react";
import { Coins, Shuffle, Swords, X } from "lucide-react";
import { useDiceActions, type DiceLastResult } from "../hooks/useDiceActions";
import { DiceIcon } from "./DiceIcon";

interface DiceQuickAccessProps {
  onClose: () => void;
  diceActions: ReturnType<typeof useDiceActions>;
  hasPlayers: boolean;
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

const ResultIcon: React.FC<{ r: DiceLastResult; size?: number }> = ({ r, size = 18 }) => {
  if (r.kind === "dice") return <DiceIcon sides={r.sides} size={size} color="var(--accent-purple)" />;
  if (r.kind === "coin") return <Coins size={size} color="var(--accent-gold)" />;
  return r.mode === "opponent"
    ? <Swords size={size} color="var(--accent-rose)" />
    : <Shuffle size={size} color="var(--accent-purple)" />;
};

/** Compact "hold the dice button" quick-roll popup — stays open across taps so you can chain rolls. */
export const DiceQuickAccess: React.FC<DiceQuickAccessProps> = ({ onClose, diceActions, hasPlayers }) => {
  const { lastResult, rollingKeys, flipCoin, rollDie, randomizePlayer } = diceActions;

  return (
    <>
      <div
        onPointerDown={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", zIndex: 320 }}
      />
      <div
        className="glass-panel"
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", top: "calc(var(--app-height, 100dvh) / 2)", left: "50%",
          transform: "translate(-50%, -50%)", width: "min(300px, 88vw)", zIndex: 321,
          padding: "16px", display: "flex", flexDirection: "column", gap: "12px",
          animation: "sheet-enter-center 0.18s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Quick Access
          </span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        {lastResult && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", fontWeight: 700 }}>
            <ResultIcon r={lastResult} size={18} />
            <span>{describeResultText(lastResult)}</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          <button
            onClick={flipCoin}
            aria-label="Flip coin"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "12px 6px", borderRadius: "10px", background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)", cursor: "pointer" }}
          >
            <Coins size={20} color="var(--accent-gold)" className={rollingKeys.has("coin") ? "anim-coin" : undefined} />
            <span style={{ fontSize: "0.65rem", fontWeight: 700 }}>Coin</span>
          </button>
          <button
            onClick={() => randomizePlayer("any")}
            disabled={!hasPlayers}
            aria-label="Randomize player"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "12px 6px", borderRadius: "10px", background: "color-mix(in srgb, var(--accent-purple) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 25%, transparent)", cursor: hasPlayers ? "pointer" : "not-allowed", opacity: hasPlayers ? 1 : 0.5 }}
          >
            <Shuffle size={20} color="var(--accent-purple)" />
            <span style={{ fontSize: "0.65rem", fontWeight: 700 }}>Player</span>
          </button>
          <button
            onClick={() => randomizePlayer("opponent")}
            disabled={!hasPlayers}
            aria-label="Randomize opponent"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "12px 6px", borderRadius: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", cursor: hasPlayers ? "pointer" : "not-allowed", opacity: hasPlayers ? 1 : 0.5 }}
          >
            <Swords size={20} color="var(--accent-rose)" />
            <span style={{ fontSize: "0.65rem", fontWeight: 700 }}>Opponent</span>
          </button>

          {DICE_TYPES.map(d => (
            <button
              key={d.name}
              onClick={() => rollDie(d.name, d.sides)}
              aria-label={`Roll ${d.name}`}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "12px 6px", borderRadius: "10px", background: "rgba(255,255,255,0.02)", border: `1px solid ${d.color}40`, cursor: "pointer" }}
            >
              <DiceIcon sides={d.sides} size={20} color={d.color} rolling={rollingKeys.has(`dice:${d.name}:1`)} />
              <span style={{ fontSize: "0.65rem", fontWeight: 700, color: d.color }}>{d.name}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
