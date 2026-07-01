import React, { useState, useEffect, useRef } from "react";
import { Shuffle, Sparkles, Trophy, Users, AlertTriangle, Play } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { useMobile } from "../hooks/useMobile";
import {
  subscribeWithRetry,
  broadcastState,
  persistState,
  fetchPersistedState,
  reattachHandler,
  SYNC_SCHEMA_VERSION,
} from "../services/multiplayerSync";
import type { SyncState } from "../services/multiplayerSync";
import type { LobbyPlayer } from "../types/game";

// ── Colors (match LifeCounter palette) ───────────────────────────────────────

const LC_COLORS = {
  white:  "#d6ad60",
  blue:   "#38bdf8",
  black:  "#a855f7",
  red:    "#ef4444",
  green:  "#10b981",
  purple: "#ec4899",
} as const;
type LCColorKey = keyof typeof LC_COLORS;

interface RollOffResult {
  name: string;
  roll: number;
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface TurnOrderProps {
  /** Set by App.tsx when this view was reached via the multiplayer lobby flow. */
  mpRoomCode?:      string | null;
  mpRole?:          "host" | "guest" | null;
  mpLobbyPlayers?:  LobbyPlayer[];
  /** Called when this view needs to signal App.tsx to switch tabs.
   *  `spinWinner` is the name of the player who won the spin. */
  onMpPhaseChange?: (phase: "game", spinWinner?: string) => void;
}

// ── Spin duration ──────────────────────────────────────────────────────────────
/** Fixed animation length used on ALL devices for the synchronized spin. */
const MP_SPIN_DURATION_MS = 3_500;

export const TurnOrder: React.FC<TurnOrderProps> = ({
  mpRoomCode,
  mpRole,
  mpLobbyPlayers,
  onMpPhaseChange,
}) => {
  const isMobile = useMobile(768);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const spinTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollAnimIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mpBroadcastDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current        !== null) clearTimeout(spinTimeoutRef.current);
      if (rollAnimIntervalRef.current   !== null) clearInterval(rollAnimIntervalRef.current);
      if (mpBroadcastDelayRef.current   !== null) clearTimeout(mpBroadcastDelayRef.current);
    };
  }, []);

  // ── Multiplayer state ─────────────────────────────────────────────────────
  const isMultiplayer = Boolean(mpRoomCode && mpLobbyPlayers && mpLobbyPlayers.length > 0);
  const [showBeginGame, setShowBeginGame] = useState(false);
  // Stable refs — avoids stale closures in Supabase callbacks; updated every render below
  const handleMpUpdateRef      = useRef<(s: SyncState) => void>(() => undefined);
  const runMpSpinAnimationRef  = useRef<(name: string) => void>(() => undefined);
  // Called by the DB poll when a spin result is found but the broadcast was missed
  const applySpinWinnerRef     = useRef<(name: string) => void>(() => undefined);
  // Tracks the current spin winner in a ref so setInterval poll callbacks see the latest value
  // (useState closures captured inside setInterval are stale without this)
  const mpSpinWinnerRef = useRef<string | null>(null);

  // Subscribe to room when in multiplayer mode
  useEffect(() => {
    if (!isMultiplayer || !mpRoomCode) return;
    let alive = true;

    // Reuse the GameNight channel if still active — avoids the 0.5–3 s reconnect
    // window that causes missed spin and Begin Game broadcasts.
    const reused = reattachHandler(mpRoomCode, s => { if (alive) handleMpUpdateRef.current(s); });
    if (!reused) {
      // No existing channel (solo TurnOrder, or GameNight already tore down) — create one.
      subscribeWithRetry(mpRoomCode, s => { if (alive) handleMpUpdateRef.current(s); });
    }

    // Safety-net poll: catches guests who missed the ephemeral Begin Game broadcast.
    const pollInterval = setInterval(() => {
      fetchPersistedState(mpRoomCode).then(saved => {
        if (!alive) return;
        if (!saved || saved.schemaVersion !== SYNC_SCHEMA_VERSION) return;
        if (Date.now() - saved.updatedAt >= 5 * 60_000) return; // stale

        if (saved.phase === "game") {
          clearInterval(pollInterval);
          onMpPhaseChange?.("game", saved.mpSpinWinner ?? undefined);
          return;
        }
        // Spin result persisted but broadcast was missed — show winner without animation
        if (saved.phase === "turn-select" && saved.mpSpinWinner && !mpSpinWinnerRef.current) {
          mpSpinWinnerRef.current = saved.mpSpinWinner;
          applySpinWinnerRef.current(saved.mpSpinWinner);
        }
      });
    }, 6_000);

    return () => {
      alive = false;
      clearInterval(pollInterval);
      // Do NOT call leaveRoom — hand the channel off to LifeCounter's useMultiplayer.
      // The channel will only be torn down when the user explicitly leaves the room.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpRoomCode]);

  // Keep handleMpUpdateRef fresh every render (calls runMpSpinAnimationRef so no forward-ref issue)
  useEffect(() => {
    handleMpUpdateRef.current = (state: SyncState) => {
      if (state.schemaVersion !== SYNC_SCHEMA_VERSION) return;
      // Phase: "game" → host pressed "Begin Game", all devices transition
      if (state.phase === "game") {
        onMpPhaseChange?.("game", state.mpSpinWinner ?? undefined);
        return;
      }
      // Receive the spin winner (computed by host)
      if (state.mpSpinWinner && !mpSpinWinnerRef.current) {
        mpSpinWinnerRef.current = state.mpSpinWinner;
        runMpSpinAnimationRef.current(state.mpSpinWinner);
      }
    };
  });

  // ── Zustand ───────────────────────────────────────────────────────────────
  const storePlayerNames = useAppStore(s => s.playerNames);

  // ── Player roster ─────────────────────────────────────────────────────────
  const [players, setPlayers] = useState<string[]>(() => {
    // In multiplayer mode, roster comes from the lobby (locked — no add/remove)
    if (mpLobbyPlayers && mpLobbyPlayers.length > 0) {
      return mpLobbyPlayers.map(p => p.playerName);
    }
    const saved = localStorage.getItem(STORAGE_KEYS.TURN_PLAYERS);
    if (saved) return JSON.parse(saved);
    if (storePlayerNames && storePlayerNames.length > 0) return storePlayerNames;
    return ["Player 1", "Player 2", "Player 3", "Player 4"];
  });

  const [newPlayerName, setNewPlayerName] = useState("");

  // Per-player color assignments — persisted to localStorage and read by LifeCounter sync
  const [playerColors, setPlayerColors] = useState<Record<string, LCColorKey>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TURN_COLORS);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Which player's color picker is open (by name)
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);

  // ── Roulette ──────────────────────────────────────────────────────────────
  const [spinning, setSpinning] = useState(false);
  const [winner,   setWinner]   = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.TURN_WINNER));
  const [currentIndex, setCurrentIndex] = useState<number | null>(() => {
    const s = localStorage.getItem(STORAGE_KEYS.TURN_INDEX);
    return s ? parseInt(s, 10) : null;
  });

  // ── Roll-off ──────────────────────────────────────────────────────────────
  const [rollOffResults, setRollOffResults] = useState<RollOffResult[]>(() => {
    const s = localStorage.getItem(STORAGE_KEYS.TURN_ROLLOFFS);
    return s ? JSON.parse(s) : [];
  });
  const [rollingOff,    setRollingOff]    = useState(false);
  const [tiedPlayers,   setTiedPlayers]   = useState<string[]>([]);

  // Numbers cycling during the animation phase
  const [animatingRolls, setAnimatingRolls] = useState<Record<string, number>>({});
  // Pool currently being rolled (for animation display)
  const [activeRollPool, setActiveRollPool] = useState<string[]>([]);

  // ── Persistence ───────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TURN_PLAYERS,  JSON.stringify(players));
    localStorage.setItem(STORAGE_KEYS.TURN_COLORS,   JSON.stringify(playerColors));
    if (winner) localStorage.setItem(STORAGE_KEYS.TURN_WINNER, winner);
    else        localStorage.removeItem(STORAGE_KEYS.TURN_WINNER);
    if (currentIndex !== null) localStorage.setItem(STORAGE_KEYS.TURN_INDEX, currentIndex.toString());
    else                       localStorage.removeItem(STORAGE_KEYS.TURN_INDEX);
    localStorage.setItem(STORAGE_KEYS.TURN_ROLLOFFS, JSON.stringify(rollOffResults));
  }, [players, playerColors, winner, currentIndex, rollOffResults]);

  // Auto-sync roster from LifeCounter when nothing custom is saved
  useEffect(() => {
    if (storePlayerNames.length > 0) {
      const saved = localStorage.getItem(STORAGE_KEYS.TURN_PLAYERS);
      if (!saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPlayers(storePlayerNames);
      }
    }
  }, [storePlayerNames]);

  // Close color picker on click outside
  useEffect(() => {
    if (!colorPickerFor) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-color-picker]")) setColorPickerFor(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colorPickerFor]);

  // ── Roster actions ────────────────────────────────────────────────────────
  const handleAddPlayer = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newPlayerName.trim()) {
      setPlayers(prev => [...prev, newPlayerName.trim()]);
      setNewPlayerName("");
    }
  };

  const handleRemovePlayer = (idx: number) => {
    setPlayers(prev => prev.filter((_, i) => i !== idx));
  };

  const setColor = (name: string, color: LCColorKey) => {
    setPlayerColors(prev => ({ ...prev, [name]: color }));
    setColorPickerFor(null);
  };

  // ── Roulette spin ─────────────────────────────────────────────────────────

  /** Run the roulette animation to a predetermined winner (used by guests + host mp mode). */
  const runMpSpinAnimation = (targetName: string) => {
    if (!isMultiplayer || !mpLobbyPlayers) return;
    const names = mpLobbyPlayers.map(p => p.playerName);
    const targetIdx = names.indexOf(targetName);
    if (targetIdx === -1) return;

    setSpinning(true);
    setWinner(null);
    mpSpinWinnerRef.current = null;

    const duration = MP_SPIN_DURATION_MS;
    let speed = 60;
    let elapsed = 0;

    const run = () => {
      setCurrentIndex(prev => (prev === null ? 0 : (prev + 1) % names.length));
      elapsed += speed;
      if (elapsed >= duration) {
        setSpinning(false);
        setCurrentIndex(targetIdx);
        setWinner(targetName);
        mpSpinWinnerRef.current = targetName;
        if (mpRole === "host") {
          setShowBeginGame(true);
          // Persist spin result so guests who missed the broadcast discover it via the 6s poll
          if (mpRoomCode) {
            persistState(mpRoomCode, {
              schemaVersion: SYNC_SCHEMA_VERSION,
              players: [], activeCounters: {} as never, dayNightState: "none",
              updatedAt: Date.now(), updatedBy: "host",
              phase: "turn-select",
              mpSpinWinner: targetName,
              lobbyPlayers: mpLobbyPlayers,
            });
          }
        }
      } else {
        if      (elapsed > duration * 0.7) speed += 40;
        else if (elapsed > duration * 0.4) speed += 20;
        spinTimeoutRef.current = setTimeout(run, speed);
      }
    };
    spinTimeoutRef.current = setTimeout(run, speed);
  };

  // Keep runMpSpinAnimationRef fresh every render so the subscription callback can call it
  useEffect(() => { runMpSpinAnimationRef.current = runMpSpinAnimation; });

  // Apply a spin winner without playing the full animation (for guests who missed the broadcast)
  useEffect(() => {
    applySpinWinnerRef.current = (name: string) => {
      const idx = (mpLobbyPlayers ?? []).findIndex(p => p.playerName === name);
      setWinner(name);
      if (idx >= 0) setCurrentIndex(idx);
      if (mpRole === "host") setShowBeginGame(true);
    };
  });

  const triggerRouletteSpin = () => {
    if (spinning || players.length === 0) return;

    // ── Multiplayer mode: host computes winner + broadcasts ────────────────
    if (isMultiplayer && mpRoomCode && mpRole === "host") {
      const finalIdx     = Math.floor(Math.random() * players.length);
      const winnerName   = players[finalIdx];
      // Start our own animation immediately
      runMpSpinAnimation(winnerName);
      // Broadcast winner to guests with a 200 ms delay so they start ~simultaneously
      mpBroadcastDelayRef.current = setTimeout(() => {
        broadcastState(mpRoomCode, {
          schemaVersion: SYNC_SCHEMA_VERSION,
          players: [], activeCounters: {} as never, dayNightState: "none",
          updatedAt: Date.now(), updatedBy: "host",
          phase: "turn-select",
          mpSpinWinner: winnerName,
        });
      }, 200);
      return;
    }

    // ── Single-device mode (original behaviour) ───────────────────────────
    setSpinning(true);
    setWinner(null);
    setRollOffResults([]);
    setTiedPlayers([]);

    const duration = 3000;
    let speed = 60;
    let elapsed = 0;

    const run = () => {
      setCurrentIndex(prev => (prev === null ? 0 : (prev + 1) % players.length));
      elapsed += speed;
      if (elapsed >= duration) {
        setSpinning(false);
        const finalIdx = Math.floor(Math.random() * players.length);
        setCurrentIndex(finalIdx);
        setWinner(players[finalIdx]);
      } else {
        if      (elapsed > duration * 0.7) speed += 40;
        else if (elapsed > duration * 0.4) speed += 20;
        spinTimeoutRef.current = setTimeout(run, speed);
      }
    };
    spinTimeoutRef.current = setTimeout(run, speed);
  };

  // ── Roll-off ──────────────────────────────────────────────────────────────
  const checkForTies = (results: RollOffResult[]): string[] => {
    if (results.length < 2) return [];
    const topRoll = results[0].roll;
    const tied = results.filter(r => r.roll === topRoll);
    return tied.length > 1 ? tied.map(r => r.name) : [];
  };

  const triggerRollOff = (subset?: string[]) => {
    const pool = subset ?? players;
    if (rollingOff || pool.length === 0) return;

    setRollingOff(true);
    setWinner(null);
    setTiedPlayers([]);
    setRollOffResults([]);
    setActiveRollPool(pool);

    // Pre-compute final results immediately (fair — happens before animation)
    const finalResults: RollOffResult[] = pool.map(name => ({
      name,
      roll: Math.floor(Math.random() * 20) + 1,
    }));

    // Seed the first frame of the animation
    setAnimatingRolls(
      Object.fromEntries(pool.map(n => [n, Math.floor(Math.random() * 20) + 1]))
    );

    // Spin for ~1.5 s (15 ticks × 100 ms), then settle on the pre-computed final rolls
    let ticks = 0;
    const TOTAL_TICKS = 15;

    rollAnimIntervalRef.current = setInterval(() => {
      ticks++;
      if (ticks < TOTAL_TICKS) {
        // Keep numbers rolling
        setAnimatingRolls(
          Object.fromEntries(pool.map(n => [n, Math.floor(Math.random() * 20) + 1]))
        );
      } else {
        // Settle — reveal real results
        clearInterval(rollAnimIntervalRef.current!);
        rollAnimIntervalRef.current = null;
        setAnimatingRolls({});
        setActiveRollPool([]);

        finalResults.sort((a, b) => b.roll - a.roll);
        setRollOffResults(finalResults);
        setRollingOff(false);

        const ties = checkForTies(finalResults);
        if (ties.length > 0) setTiedPlayers(ties);
      }
    }, 100);
  };

  const triggerTieReroll = () => {
    if (tiedPlayers.length > 0) triggerRollOff(tiedPlayers);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "800px", margin: "0 auto", width: "100%", padding: "12px" }}>

      {/* Page Title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Shuffle size={28} color="var(--accent-purple)" />
          <div>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 700 }}>Choose Who Goes First</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Roulette or d20 roll-off. Pick a color to sync with the Life Counter.
            </p>
          </div>
        </div>
      </div>

      <div style={{
        display: isMobile ? "flex" : "grid",
        flexDirection: isMobile ? "column" : undefined,
        gridTemplateColumns: isMobile ? undefined : "1fr 1.2fr",
        gap: "16px",
      }}>

        {/* ── Left: Player Roster ── */}
        <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", background: "rgba(22,19,32,0.4)", maxHeight: isMobile ? undefined : "500px" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Users size={16} color="var(--accent-cyan)" />
            Active Roster ({players.length})
          </h3>

          {/* Hide add-player form in multiplayer mode (roster is locked from lobby) */}
          {!isMultiplayer && (
            <form onSubmit={handleAddPlayer} style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                className="glass-input"
                placeholder="Add player..."
                value={newPlayerName}
                onChange={e => setNewPlayerName(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem" }}
              />
              <button
                type="submit"
                className="glass-button"
                aria-label="Add player to roster"
                style={{ background: "var(--accent-purple)", borderColor: "var(--accent-purple)", color: "#ffffff", padding: "8px 12px", fontSize: "0.8rem" }}
              >
                Add
              </button>
            </form>
          )}
          {isMultiplayer && (
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center" }}>
              Roster locked — set in lobby
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
            {players.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "0.8rem", textAlign: "center", marginTop: "24px" }}>
                Roster is empty. Add names above!
              </p>
            ) : (
              players.map((p, idx) => {
                const colorKey = playerColors[p] as LCColorKey | undefined;
                const dotColor = colorKey ? LC_COLORS[colorKey] : "rgba(255,255,255,0.2)";
                const isPickerOpen = colorPickerFor === p;

                return (
                  <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {/* Main row */}
                    <div
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "8px 10px", borderRadius: "8px",
                        background: currentIndex === idx ? "color-mix(in srgb, var(--accent-purple) 12%, transparent)" : "rgba(255,255,255,0.02)",
                        border: currentIndex === idx ? "1.5px solid var(--accent-purple)" : "1px solid rgba(255,255,255,0.04)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {/* Color dot — click to open picker */}
                      <button
                        data-color-picker
                        onClick={() => setColorPickerFor(isPickerOpen ? null : p)}
                        aria-label={`${isPickerOpen ? "Close" : "Open"} color picker for ${p}`}
                        aria-pressed={isPickerOpen}
                        style={{
                          width: "16px", height: "16px", borderRadius: "50%",
                          background: dotColor,
                          border: isPickerOpen ? "2px solid #fff" : "2px solid rgba(255,255,255,0.3)",
                          cursor: "pointer", flexShrink: 0,
                          transition: "transform 0.15s ease, border-color 0.15s ease",
                          boxShadow: colorKey ? `0 0 6px ${dotColor}80` : "none",
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.25)"}
                        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                      />

                      <span style={{ flex: 1, fontSize: "0.9rem", fontWeight: currentIndex === idx ? 700 : 500 }}>{p}</span>

                      {!isMultiplayer && (
                        <button
                          onClick={() => handleRemovePlayer(idx)}
                          aria-label={`Remove ${p} from roster`}
                          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem" }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--accent-rose)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Inline color picker — expands below the row */}
                    {isPickerOpen && (
                      <div
                        data-color-picker
                        style={{
                          display: "flex", gap: "8px", alignItems: "center",
                          padding: "8px 12px", borderRadius: "8px",
                          background: "rgba(0,0,0,0.3)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600, marginRight: "2px" }}>COLOR:</span>
                        {(Object.entries(LC_COLORS) as [LCColorKey, string][]).map(([key, hex]) => (
                          <button
                            key={key}
                            onClick={() => setColor(p, key)}
                            aria-label={`Set ${p}'s color to ${key}`}
                            aria-pressed={colorKey === key}
                            style={{
                              width: "22px", height: "22px", borderRadius: "50%",
                              background: hex,
                              border: colorKey === key ? "2.5px solid #fff" : "2px solid transparent",
                              cursor: "pointer",
                              boxShadow: colorKey === key ? `0 0 8px ${hex}` : "none",
                              transition: "transform 0.12s ease",
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = "scale(1.2)"}
                            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                          />
                        ))}
                        {colorKey && (
                          <button
                            onClick={() => { setPlayerColors(prev => { const n = { ...prev }; delete n[p]; return n; }); setColorPickerFor(null); }}
                            aria-label={`Clear color for ${p}`}
                            style={{ fontSize: "0.68rem", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", marginLeft: "2px" }}
                            onMouseEnter={e => e.currentTarget.style.color = "var(--accent-rose)"}
                            onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: Picker modules ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Module 1: Roulette Spinner */}
          <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", background: "rgba(22,19,32,0.4)" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, alignSelf: "flex-start", width: "100%", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={16} color="var(--accent-gold)" />
              Roulette Spin
            </h3>

            <div style={{ height: "100px", width: "100%", background: "rgba(0,0,0,0.2)", borderRadius: "12px", border: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
              {currentIndex !== null ? (
                <div style={{ fontSize: "2rem", fontWeight: 800, color: winner ? "var(--accent-gold)" : "#ffffff", animation: winner ? "pulse-glow 1.5s infinite" : "none", fontFamily: "'Outfit', sans-serif" }}>
                  {players[currentIndex]}
                </div>
              ) : (
                <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Ready to Spin</span>
              )}
            </div>

            {/* In multiplayer mode, only host can spin; guests see a waiting message */}
            {isMultiplayer && mpRole !== "host" ? (
              <div style={{
                padding: "10px 16px", borderRadius: "8px", textAlign: "center",
                background: "color-mix(in srgb, var(--accent-purple) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 20%, transparent)",
                color: "var(--text-muted)", fontSize: "0.85rem",
              }}>
                {spinning ? "⏳ Spinning…" : "Waiting for host to spin…"}
              </div>
            ) : (
              <button
                onClick={triggerRouletteSpin}
                className="glass-button"
                disabled={spinning || players.length === 0}
                aria-label={spinning ? "Selecting a player…" : "Spin the wheel to randomly choose who goes first"}
                aria-busy={spinning}
                style={{ background: "var(--accent-purple)", borderColor: "var(--accent-purple)", color: "#ffffff", width: "100%", justifyContent: "center" }}
              >
                <span>{spinning ? "Selecting..." : "Spin the Wheel"}</span>
              </button>
            )}

            {winner && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.95rem", color: "#ffffff", background: "rgba(234,179,8,0.1)", border: "1.5px solid rgba(234,179,8,0.3)", padding: "10px 16px", borderRadius: "8px", width: "100%", justifyContent: "center" }}>
                <Trophy size={16} color="var(--accent-gold)" />
                <span><strong>{winner}</strong> goes first!</span>
              </div>
            )}

            {/* ── Multiplayer: host-only "Begin Game" button ── */}
            {isMultiplayer && showBeginGame && mpRole === "host" && mpRoomCode && (
              <button
                onClick={() => {
                  const gamePayload: SyncState = {
                    schemaVersion: SYNC_SCHEMA_VERSION,
                    players: [], activeCounters: {} as never, dayNightState: "none",
                    updatedAt: Date.now(), updatedBy: "host",
                    phase: "game",
                    mpSpinWinner: winner ?? undefined,
                    lobbyPlayers: mpLobbyPlayers,
                  };
                  broadcastState(mpRoomCode, gamePayload);
                  // Also persist so guests who missed the ephemeral broadcast can catch up
                  persistState(mpRoomCode, gamePayload);
                  onMpPhaseChange?.("game", winner ?? undefined);
                }}
                aria-label="Begin the game — start life counter for all players"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  width: "100%", padding: "12px 20px", borderRadius: "12px", cursor: "pointer",
                  background: "linear-gradient(135deg, color-mix(in srgb, var(--accent-purple) 25%, transparent), rgba(6,182,212,0.15))",
                  border: "1.5px solid color-mix(in srgb, var(--accent-purple) 50%, transparent)",
                  color: "#fff", fontSize: "0.95rem", fontWeight: 700,
                  boxShadow: "0 0 20px color-mix(in srgb, var(--accent-purple) 25%, transparent)",
                  animation: "pulse-glow 2s infinite",
                  transition: "all 0.2s ease",
                }}
              >
                <Play size={16} /> Begin Game →
              </button>
            )}
          </div>

          {/* Module 2: Simultaneous Roll-Off */}
          <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", background: "rgba(22,19,32,0.4)" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Shuffle size={16} color="var(--accent-purple)" />
              Simultaneous Roll-Off
            </h3>

            <button
              onClick={() => triggerRollOff()}
              className="glass-button"
              disabled={rollingOff || players.length === 0}
              aria-label={rollingOff ? "Rolling D20s for all players…" : "Roll D20 for all players to determine turn order"}
              aria-busy={rollingOff}
              style={{ background: "rgba(255,255,255,0.04)", width: "100%", justifyContent: "center" }}
            >
              <span>{rollingOff ? "Rolling D20s..." : "Roll D20 for All"}</span>
            </button>

            {/* ── Dice animation — numbers cycling before reveal ── */}
            {rollingOff && activeRollPool.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
                {activeRollPool.map(name => (
                  <div
                    key={name}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", borderRadius: "8px",
                      background: "color-mix(in srgb, var(--accent-purple) 5%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--accent-purple) 18%, transparent)",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-secondary)" }}>{name}</span>
                    {/* key forces React to remount the span on every tick, retriggering the CSS fade */}
                    <span
                      key={animatingRolls[name]}
                      style={{
                        fontSize: "0.9rem", fontWeight: 800,
                        color: "var(--accent-purple)",
                        background: "color-mix(in srgb, var(--accent-purple) 18%, transparent)",
                        padding: "2px 10px", borderRadius: "5px",
                        minWidth: "58px", textAlign: "center",
                        display: "inline-block",
                        animation: "roll-tick 0.08s ease-out",
                      }}
                    >
                      🎲 {animatingRolls[name] ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Tie banner */}
            {tiedPlayers.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "10px 14px", borderRadius: "8px", background: "rgba(234,179,8,0.08)", border: "1.5px solid rgba(234,179,8,0.35)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <AlertTriangle size={15} color="var(--accent-gold)" />
                  <span style={{ fontSize: "0.82rem", color: "var(--accent-gold)", fontWeight: 600 }}>
                    TIE — Re-roll between: {tiedPlayers.join(", ")}
                  </span>
                </div>
                <button
                  onClick={triggerTieReroll}
                  disabled={rollingOff}
                  className="glass-button"
                  aria-label={`Re-roll D20 between tied players: ${tiedPlayers.join(", ")}`}
                  style={{ padding: "5px 10px", fontSize: "0.75rem", background: "rgba(234,179,8,0.12)", borderColor: "rgba(234,179,8,0.3)", color: "var(--accent-gold)", flexShrink: 0 }}
                >
                  Re-Roll
                </button>
              </div>
            )}

            {/* Final sorted results */}
            {rollOffResults.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
                {rollOffResults.map((res, rank) => {
                  const isTied = tiedPlayers.includes(res.name);
                  const isTop  = rank === 0 && tiedPlayers.length === 0;
                  return (
                    <div
                      key={res.name}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", borderRadius: "8px",
                        background: isTop ? "rgba(16,185,129,0.08)" : isTied ? "rgba(234,179,8,0.06)" : "rgba(255,255,255,0.01)",
                        border: isTop ? "1px solid rgba(16,185,129,0.25)" : isTied ? "1px solid rgba(234,179,8,0.25)" : "1px solid rgba(255,255,255,0.03)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: isTop ? "var(--accent-emerald)" : isTied ? "var(--accent-gold)" : "var(--text-muted)", width: "20px" }}>
                          #{rank + 1}
                        </span>
                        <span style={{ fontSize: "0.85rem", fontWeight: (isTop || isTied) ? 700 : 500 }}>{res.name}</span>
                      </div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 800, color: isTop ? "var(--accent-emerald)" : isTied ? "var(--accent-gold)" : "var(--text-primary)", background: "rgba(0,0,0,0.2)", padding: "2px 8px", borderRadius: "4px" }}>
                        D20: {res.roll}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>


        </div>
      </div>

      {/* Keyframe for roll tick animation */}
      <style>{`
        @keyframes roll-tick {
          0%   { opacity: 0.4; transform: translateY(-4px) scaleY(0.85); }
          100% { opacity: 1;   transform: translateY(0)    scaleY(1); }
        }
      `}</style>
    </div>
  );
};
