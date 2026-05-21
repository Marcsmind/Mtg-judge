import React, { useState, useRef } from "react";
import { Dices, Hash, Trash2, ChevronRight, ChevronLeft } from "lucide-react";
import { hapticMedium, hapticHeavy } from "../utils/haptics";

interface RollLog {
  id: string;
  time: string;
  type: "coin" | "dice";
  label: string;
  result: string;
}

interface RollStage {
  diceType: string;
  sides: number;
  phase: "rolling" | "result";
  result: number;
  breakdown: number[];
  animKey: number;
  color: string;
}

// Dot patterns for d6 faces (1-6)
const D6_DOTS: boolean[][] = [
  // face 1
  [false,false,false,false,true,false,false,false,false],
  // face 2
  [true,false,false,false,false,false,false,false,true],
  // face 3
  [true,false,false,false,true,false,false,false,true],
  // face 4
  [true,false,true,false,false,false,true,false,true],
  // face 5
  [true,false,true,false,true,false,true,false,true],
  // face 6
  [true,true,true,false,false,false,true,true,true],
];

const D6Face: React.FC<{ value: number; size?: number; color?: string }> = ({ value, size = 80, color = "#8b5cf6" }) => {
  const dots = D6_DOTS[Math.min(Math.max(value, 1), 6) - 1];
  return (
    <div style={{
      width: size, height: size,
      background: `linear-gradient(135deg, rgba(22,19,32,0.9) 0%, rgba(12,9,20,0.95) 100%)`,
      border: `2px solid ${color}60`,
      borderRadius: size * 0.2,
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
      padding: size * 0.12,
      gap: size * 0.06,
      boxShadow: `0 0 20px ${color}30, inset 0 1px 0 rgba(255,255,255,0.08)`,
    }}>
      {dots.map((on, i) => (
        <div key={i} style={{
          borderRadius: "50%",
          background: on ? color : "transparent",
          boxShadow: on ? `0 0 6px ${color}80` : "none",
          transition: "all 0.1s ease",
        }} />
      ))}
    </div>
  );
};

export const DiceAndCoins: React.FC = () => {
  const [ledgerOpen, setLedgerOpen] = useState(() => window.innerWidth >= 768);
  const [coinFlipping, setCoinFlipping] = useState(false);
  const [coinResult, setCoinResult] = useState<"Heads" | "Tails" | null>(null);
  // Accumulated rotation — CSS transition drives the flip animation
  const [coinRotation, setCoinRotation] = useState(0);

  const [diceRolling, setDiceRolling] = useState<Record<string, boolean>>({});
  const [diceResult, setDiceResult] = useState<Record<string, { value: number; breakdown?: number[] }>>({});

  const [diceCount, setDiceCount] = useState<number>(1);
  const [history, setHistory] = useState<RollLog[]>([]);
  const [rollStage, setRollStage] = useState<RollStage | null>(null);
  const rollStageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const diceTypes = [
    { name: "d4",   sides: 4,   color: "var(--accent-rose)"     },
    { name: "d6",   sides: 6,   color: "var(--accent-emerald)"  },
    { name: "d8",   sides: 8,   color: "var(--accent-cyan)"     },
    { name: "d10",  sides: 10,  color: "var(--accent-gold)"     },
    { name: "d12",  sides: 12,  color: "var(--accent-purple)"   },
    { name: "d20",  sides: 20,  color: "var(--accent-purple)"   },
    { name: "d100", sides: 100, color: "var(--text-secondary)"  },
  ];

  const addLog = (type: "coin" | "dice", label: string, result: string) => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    // eslint-disable-next-line react-hooks/purity
    const logId = Math.random().toString(36).slice(2, 11);
    const log: RollLog = { id: logId, time, type, label, result };
    setHistory(prev => [log, ...prev]);
  };

  // ── Coin flip: 3D two-faced rotation ──────────────────────────────────────
  const handleFlipCoin = () => {
    if (coinFlipping) return;
    setCoinFlipping(true);
    setCoinResult(null);

    // eslint-disable-next-line react-hooks/purity
    const outcome = Math.random() < 0.5 ? "Heads" : "Tails";
    // 8 full rotations (2880°) + landing offset: 0° = heads, 180° = tails
    const landingOffset = outcome === "Tails" ? 180 : 0;
    setCoinRotation(prev => prev + 2880 + landingOffset);

    setTimeout(() => {
      setCoinResult(outcome);
      setCoinFlipping(false);
      hapticMedium();
      addLog("coin", "Coin Flip", outcome);
    }, 1500);
  };

  // ── Dice roll ─────────────────────────────────────────────────────────────
  const handleRollDice = (name: string, sides: number, color: string) => {
    if (diceRolling[name]) return;
    setDiceRolling(prev => ({ ...prev, [name]: true }));

    const rolls: number[] = [];
    let sum = 0;
    for (let i = 0; i < diceCount; i++) {
      // eslint-disable-next-line react-hooks/purity
      const val = Math.floor(Math.random() * sides) + 1;
      rolls.push(val);
      sum += val;
    }

    // Show rolling stage immediately
    if (rollStageTimerRef.current) clearTimeout(rollStageTimerRef.current);
    // eslint-disable-next-line react-hooks/purity
    const animKey = Date.now();
    setRollStage({ diceType: name, sides, phase: "rolling", result: sum, breakdown: rolls, animKey, color });

    rollStageTimerRef.current = setTimeout(() => {
      setDiceResult(prev => ({ ...prev, [name]: { value: sum, breakdown: rolls } }));
      setDiceRolling(prev => ({ ...prev, [name]: false }));
      const finalAnimKey = Date.now();
      setRollStage(prev => prev ? { ...prev, phase: "result", animKey: finalAnimKey } : null);
      // Haptic feedback: heavy for crit/crit-fail, medium for everything else
      if (rolls.length === 1 && (sum === sides || (sum === 1 && sides === 20))) hapticHeavy();
      else hapticMedium();
      const label = `${diceCount}${name}`;
      const resultText = diceCount > 1 ? `${sum} [${rolls.join(", ")}]` : `${sum}`;
      addLog("dice", label, resultText);
    }, 700);
  };

  const handleClearHistory = () => setHistory([]);

  // ── Result colour helpers ─────────────────────────────────────────────────
  const isCrit     = (s: RollStage) => s.breakdown.length === 1 && s.result === s.sides;
  const isCritFail = (s: RollStage) => s.breakdown.length === 1 && s.result === 1 && s.sides === 20;
  const stageColor = (s: RollStage) => isCrit(s) ? "#eab308" : isCritFail(s) ? "#ef4444" : "#fff";
  const stageShadow = (s: RollStage) =>
    isCrit(s)     ? "0 0 48px rgba(234,179,8,0.9),   0 0 24px rgba(234,179,8,0.6)"
    : isCritFail(s) ? "0 0 48px rgba(239,68,68,0.9),  0 0 24px rgba(239,68,68,0.6)"
    : "0 0 24px rgba(139,92,246,0.4)";

  return (
    <div style={{ display: "flex", gap: "24px", height: "calc(100vh - 48px)", overflow: "hidden", position: "relative" }}>

      {/* Primary Roller Pane */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px", minWidth: 0 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Dices size={28} color="var(--accent-purple)" />
            <div>
              <h2 style={{ fontSize: "1.6rem", fontWeight: 700 }}>Roll & Flip</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                Interactive polyhedral dice and high-velocity coin modules.
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px", paddingBottom: "20px" }}>

          {/* Dice Count Modifier */}
          <div className="glass-panel" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Hash size={18} color="var(--accent-cyan)" />
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Number of Dice:</span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {[1, 2, 3, 4, 5, 10].map(num => (
                <button
                  key={num}
                  onClick={() => setDiceCount(num)}
                  style={{
                    background: diceCount === num ? "var(--accent-purple)" : "rgba(255,255,255,0.02)",
                    border: "1px solid var(--border-color)",
                    color: diceCount === num ? "#fff" : "var(--text-secondary)",
                    borderRadius: "8px", width: "36px", height: "36px",
                    cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Coin + Dice Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", flexShrink: 0 }}>

            {/* ── Coin Flipper ── */}
            <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", background: "rgba(22,19,32,0.4)", minHeight: "300px" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent-cyan)", alignSelf: "flex-start", borderBottom: "1px solid rgba(255,255,255,0.05)", width: "100%", paddingBottom: "8px" }}>
                Coin Flipper
              </h3>

              {/* 3-D two-faced coin */}
              <div
                onClick={handleFlipCoin}
                style={{ perspective: "600px", width: "140px", height: "140px", cursor: coinFlipping ? "not-allowed" : "pointer" }}
              >
                <div style={{
                  width: "100%", height: "100%",
                  position: "relative", transformStyle: "preserve-3d",
                  transform: `rotateY(${coinRotation}deg)`,
                  transition: coinFlipping ? "transform 1.5s cubic-bezier(0.15,0.85,0.15,1)" : "none",
                }}>
                  {/* Heads face */}
                  <div style={{
                    position: "absolute", width: "100%", height: "100%",
                    borderRadius: "50%", backfaceVisibility: "hidden",
                    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)",
                    boxShadow: "0 8px 24px rgba(234,179,8,0.4), inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -2px 0 rgba(0,0,0,0.2)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px",
                  }}>
                    <span style={{ fontSize: "2.4rem", lineHeight: 1, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>👑</span>
                    <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.85)", letterSpacing: "1.5px", textTransform: "uppercase" }}>Heads</span>
                  </div>
                  {/* Tails face */}
                  <div style={{
                    position: "absolute", width: "100%", height: "100%",
                    borderRadius: "50%", backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    background: "linear-gradient(135deg, #9ca3af 0%, #6b7280 50%, #4b5563 100%)",
                    boxShadow: "0 8px 24px rgba(107,114,128,0.4), inset 0 2px 0 rgba(255,255,255,0.2), inset 0 -2px 0 rgba(0,0,0,0.2)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px",
                  }}>
                    <span style={{ fontSize: "2.4rem", lineHeight: 1, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>⚔️</span>
                    <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.85)", letterSpacing: "1.5px", textTransform: "uppercase" }}>Tails</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <button
                  onClick={handleFlipCoin}
                  className="glass-button"
                  disabled={coinFlipping}
                  style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", padding: "10px 24px" }}
                >
                  <span>{coinFlipping ? "Flipping..." : "Flip Coin"}</span>
                </button>
                {coinResult && !coinFlipping && (
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Landed on: <strong style={{ color: coinResult === "Heads" ? "var(--accent-gold)" : "var(--text-primary)" }}>{coinResult}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* ── Polyhedral Dice ── */}
            <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px", background: "rgba(22,19,32,0.4)" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent-purple)", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px", flexShrink: 0 }}>
                Polyhedral Array
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px", overflowY: "auto", flex: 1 }}>
                {diceTypes.map(d => {
                  const rolling = diceRolling[d.name];
                  const result  = diceResult[d.name];
                  return (
                    <div
                      key={d.name}
                      style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        borderRadius: "10px", padding: "8px 14px",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{
                          width: "30px", height: "30px", borderRadius: "6px",
                          background: d.color,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase",
                          boxShadow: `0 0 10px ${d.color}33`,
                        }}>
                          {d.name}
                        </div>
                        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{d.sides}-sided</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        {result && !rolling && (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>{result.value}</span>
                            {result.breakdown && result.breakdown.length > 1 && (
                              <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: "-2px" }}>
                                [{result.breakdown.join("+")}]
                              </span>
                            )}
                          </div>
                        )}
                        {rolling && (
                          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", animation: "pulse 0.6s infinite" }}>…</span>
                        )}
                        <button
                          onClick={() => handleRollDice(d.name, d.sides, d.color)}
                          className="glass-button"
                          disabled={rolling}
                          style={{ padding: "6px 14px", fontSize: "0.75rem", background: "rgba(255,255,255,0.04)" }}
                        >
                          Roll
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Roll Stage ── */}
          {rollStage ? (
            <div className="glass-panel" style={{
              padding: "28px 24px", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "14px",
              background: "rgba(12,9,20,0.7)", flexShrink: 0, minHeight: "170px",
              border: `1px solid ${rollStage.phase === "result" && isCrit(rollStage) ? "rgba(234,179,8,0.4)" : isCritFail(rollStage) ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.06)"}`,
            }}>
              {rollStage.phase === "rolling" ? (
                <>
                  <span className="anim-spin-stage" style={{ fontSize: "4.5rem", lineHeight: 1 }}>🎲</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
                    Rolling {diceCount > 1 ? `${diceCount}×` : ""}{rollStage.diceType}…
                  </span>
                </>
              ) : (
                <>
                  {/* d6 shows actual face with dots; all others show the big number */}
                  {rollStage.sides === 6 && rollStage.breakdown.length === 1 ? (
                    <div className="anim-result-pop">
                      <D6Face value={rollStage.result} size={96} color={rollStage.color} />
                    </div>
                  ) : (
                    <span
                      className="anim-result-pop"
                      style={{
                        fontSize: "clamp(4rem, 8vw, 6rem)",
                        fontWeight: 900,
                        lineHeight: 1,
                        color: stageColor(rollStage),
                        textShadow: stageShadow(rollStage),
                        fontFamily: "'Outfit', sans-serif",
                      }}
                    >
                      {rollStage.result}
                    </span>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      {diceCount > 1 ? `${diceCount}×` : ""}{rollStage.diceType}
                      {isCrit(rollStage)     ? " — NATURAL MAX! 🎉" : ""}
                      {isCritFail(rollStage) ? " — CRITICAL FAIL 💀" : ""}
                    </span>
                    {rollStage.breakdown.length > 1 && (
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        [{rollStage.breakdown.join(" + ")}]
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Empty stage placeholder */
            <div className="glass-panel" style={{
              padding: "28px 24px", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "8px",
              background: "rgba(12,9,20,0.5)", flexShrink: 0, minHeight: "140px",
              border: "1px solid rgba(255,255,255,0.04)",
            }}>
              <span style={{ fontSize: "2.5rem", opacity: 0.25 }}>🎲</span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Roll a die to see it in action</span>
            </div>
          )}

        </div>{/* end scrollable */}
      </div>

      {/* ── Roll History Ledger (collapsible) ── */}
      {ledgerOpen ? (
        <div className="glass-panel" style={{ width: "280px", display: "flex", flexDirection: "column", padding: "16px", height: "100%", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px", marginBottom: "12px" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Roll Ledger</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--accent-rose)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                  title="Clear Ledger"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                onClick={() => setLedgerOpen(false)}
                title="Collapse ledger"
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px", display: "flex" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
            {history.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "0.75rem", textAlign: "center", marginTop: "40px" }}>
                Ledger empty.<br />Roll or flip to begin.
              </div>
            ) : (
              history.map(log => (
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
                  <span style={{
                    fontSize: "0.85rem", fontWeight: 800,
                    color: log.type === "coin" ? "var(--accent-gold)" : "var(--accent-purple)",
                    background: log.type === "coin" ? "rgba(234,179,8,0.08)" : "rgba(139,92,246,0.08)",
                    padding: "2px 8px", borderRadius: "4px",
                  }}>
                    {log.result}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Collapsed ledger — thin strip */
        <div
          className="glass-panel"
          style={{ width: "32px", display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", flexShrink: 0, gap: "10px", cursor: "pointer" }}
          onClick={() => setLedgerOpen(true)}
          title="Open Roll Ledger"
        >
          <ChevronLeft size={16} color="var(--accent-purple)" />
          <div style={{ writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)", fontSize: "0.62rem", color: "var(--text-muted)", letterSpacing: "0.5px", fontWeight: 600, textTransform: "uppercase", userSelect: "none" }}>
            Ledger {history.length > 0 ? `(${history.length})` : ""}
          </div>
        </div>
      )}

    </div>
  );
};
