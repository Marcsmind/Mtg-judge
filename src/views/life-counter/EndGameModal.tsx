/**
 * End Game & Record modal — shown when the user clicks "End & Record".
 *
 * Flow:
 *   1. Display final standings (auto-detects winner).
 *   2. Ask "Which player are you?" so we can link this device's auth user
 *      to the correct participant row.
 *   3. "Record & Reset" writes to Supabase and resets the board.
 *   4. "Skip & Reset" resets without recording.
 */

import React, { useState } from "react";
import { X, Trophy, Crown, Skull, Check, Loader2 } from "lucide-react";
import { BottomSheet } from "../../components/BottomSheet";
import type { Player } from "../../types/game";

interface EndGameModalProps {
  players: Player[];
  startingLife: number;
  timerSeconds: number;
  isSupabaseConfigured: boolean;
  onConfirm: (selectedPlayerId: number | null) => Promise<void>;
  onSkip: () => void;
  onCancel: () => void;
}

const playerColors: Record<string, string> = {
  white:  "#d6ad60",
  blue:   "#38bdf8",
  black:  "#a855f7",
  red:    "#ef4444",
  green:  "#10b981",
  purple: "#ec4899",
};

function isDefeated(p: Player): boolean {
  const cmdTaken = Object.values(p.commanderDamage).reduce((s, v) => s + v, 0);
  return p.life <= 0 || (p.poison ?? 0) >= 10 || cmdTaken >= 21;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export const EndGameModal: React.FC<EndGameModalProps> = ({
  players,
  startingLife,
  timerSeconds,
  isSupabaseConfigured,
  onConfirm,
  onSkip,
  onCancel,
}) => {
  // Auto-detect winner: the single non-defeated player, or highest life
  const alive = players.filter(p => !isDefeated(p));
  const autoWinner = alive.length === 1
    ? alive[0]
    : [...players].sort((a, b) => b.life - a.life)[0];

  const sorted = [...players].sort((a, b) => {
    if (!isDefeated(a) && isDefeated(b)) return -1;
    if (isDefeated(a) && !isDefeated(b)) return 1;
    return b.life - a.life;
  });

  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(
    players[0]?.id ?? 1,
  );
  const [recording, setRecording] = useState(false);

  const handleRecord = async () => {
    setRecording(true);
    await onConfirm(selectedPlayerId);
    setRecording(false);
  };

  return (
    <BottomSheet onClose={onCancel} zIndex={300} maxWidth="480px">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Trophy size={22} color="#eab308" />
            <div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800 }}>End Game</h2>
              {timerSeconds > 0 && (
                <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Duration: {formatDuration(timerSeconds)} · {players.length} players · {startingLife} life
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "4px" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-secondary)"}
          >
            <X size={20} />
          </button>
        </div>

        {/* Winner banner */}
        {autoWinner && (
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            background: "rgba(234,179,8,0.08)", border: "1.5px solid rgba(234,179,8,0.3)",
            borderRadius: "10px", padding: "12px 16px",
          }}>
            <Crown size={18} color="#eab308" />
            <div>
              <p style={{ fontSize: "0.7rem", color: "var(--accent-gold)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                {alive.length === 1 ? "Winner" : "Highest Life"}
              </p>
              <p style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>{autoWinner.name}</p>
            </div>
          </div>
        )}

        {/* Final standings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Final Standings
          </p>
          {sorted.map((p, rank) => {
            const accent = playerColors[p.colorName] ?? "#ec4899";
            const dead = isDefeated(p);
            const isWinner = p.id === autoWinner?.id && !dead;
            return (
              <div
                key={p.id}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "8px 12px", borderRadius: "8px",
                  background: isWinner ? "rgba(234,179,8,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isWinner ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.04)"}`,
                }}
              >
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: rank === 0 ? "#eab308" : "var(--text-muted)", width: "22px", textAlign: "center" }}>
                  #{rank + 1}
                </span>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: accent, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: "0.88rem", fontWeight: 600, color: dead ? "var(--text-muted)" : "#fff" }}>
                  {p.name}
                  {dead && <span style={{ fontSize: "0.65rem", color: "var(--accent-rose)", marginLeft: "6px" }}>DEFEATED</span>}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                  <span style={{ fontSize: "0.95rem", fontWeight: 900, color: p.life <= 0 ? "var(--accent-rose)" : "#fff" }}>{p.life}</span>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>♥</span>
                </div>
                {isWinner && <Crown size={14} color="#eab308" />}
                {dead && <Skull size={14} color="var(--accent-rose)" />}
              </div>
            );
          })}
        </div>

        {/* Who are you? — only shown when Supabase is configured */}
        {isSupabaseConfigured && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
              Which player are you? (for the leaderboard)
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {players.map(p => {
                const accent = playerColors[p.colorName] ?? "#ec4899";
                const isSelected = selectedPlayerId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayerId(p.id)}
                    aria-pressed={isSelected}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "6px 12px", borderRadius: "8px", cursor: "pointer",
                      fontWeight: 600, fontSize: "0.82rem",
                      background: isSelected ? `${accent}22` : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${isSelected ? accent : "rgba(255,255,255,0.08)"}`,
                      color: isSelected ? accent : "var(--text-muted)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {isSelected && <Check size={12} />}
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
          {isSupabaseConfigured && (
            <button
              onClick={handleRecord}
              disabled={recording}
              className="glass-button"
              style={{
                flex: 1, justifyContent: "center",
                background: "color-mix(in srgb, var(--accent-purple) 15%, transparent)",
                borderColor: "color-mix(in srgb, var(--accent-purple) 40%, transparent)",
                color: "#fff", fontWeight: 700,
              }}
            >
              {recording ? (
                <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /><span>Recording…</span></>
              ) : (
                <><Trophy size={15} color="var(--accent-gold)" /><span>Record &amp; Reset</span></>
              )}
            </button>
          )}

          <button
            onClick={onSkip}
            className="glass-button"
            style={{
              flex: isSupabaseConfigured ? 0 : 1,
              justifyContent: "center",
              padding: isSupabaseConfigured ? "10px 14px" : undefined,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span>{isSupabaseConfigured ? "Skip & Reset" : "Reset Game"}</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
