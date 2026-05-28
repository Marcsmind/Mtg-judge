/**
 * GameNight — Full pre-game setup experience.
 *
 * Flow:
 *   idle ──► lobby (LobbyPanel) ──► turn-select (TurnOrder tab) ──► life (LifeCounter tab)
 *
 * This view owns the room subscription and lobby state so LifeCounter stays
 * as a pure life-tracker. Once everyone readies up and the host clicks
 * "All In — Start!", we hand off to TurnOrder via onMpPhaseChange.
 */
import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles, Wifi, WifiOff, Copy, Check, Crown, QrCode,
} from "lucide-react";
import { LobbyPanel } from "./life-counter/LobbyPanel";
import { RoomQRCode } from "../components/RoomQRCode";
import { QRScanner } from "../components/QRScanner";
import { useFeature } from "../hooks/useFeature";
import { getDeviceId } from "../services/auth";
import {
  generateRoomCode,
  createRoom,
  joinRoom as joinSyncRoom,
  broadcastState,
  leaveRoom,
  persistState,
  fetchPersistedState,
  SYNC_SCHEMA_VERSION,
} from "../services/multiplayerSync";
import type { SyncState } from "../services/multiplayerSync";
import type { LobbyPlayer, ActiveCounters } from "../types/game";
import { isSupabaseConfigured } from "../services/supabase";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { useToast } from "../components/Toast";

// ── Types ────────────────────────────────────────────────────────────────────

interface GameNightProps {
  onMpPhaseChange: (
    phase: "turn-select" | "game" | null,
    lobbyPlayers?: LobbyPlayer[],
    roomCode?: string,
    role?: "host" | "guest",
  ) => void;
}

// Empty ActiveCounters placeholder used in pre-game broadcasts (no game state yet)
const EMPTY_COUNTERS: ActiveCounters = {
  monarch: false, poison: false, dayNight: false, initiative: false, cityBlessing: false, tokens: false,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Merge two LobbyPlayer arrays; last-in wins for the same deviceId. */
function mergeLobbyPlayers(current: LobbyPlayer[], incoming: LobbyPlayer[]): LobbyPlayer[] {
  const map = new Map(current.map(p => [p.deviceId, p]));
  for (const p of incoming) map.set(p.deviceId, p);
  return [...map.values()];
}

/** Build a lobby-phase SyncState (no real game state yet). */
function buildLobbyBroadcast(lobby: LobbyPlayer[], updatedBy: string): Omit<SyncState, "roomName"> {
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    players: [],
    activeCounters: EMPTY_COUNTERS,
    dayNightState: "none",
    updatedAt: Date.now(),
    updatedBy,
    phase: "lobby",
    lobbyPlayers: lobby,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export const GameNight: React.FC<GameNightProps> = ({ onMpPhaseChange }) => {
  const canHostPod = useFeature("host_multiplayer_pod");
  const { showToast } = useToast();

  // ── State ──
  const [phase, setPhase]               = useState<"idle" | "lobby">("idle");
  const [roomCode, setRoomCode]         = useState<string | null>(null);
  const [roomRole, setRoomRole]         = useState<"host" | "guest" | null>(null);
  const [roomConnected, setRoomConnected] = useState(false);
  const [roomLoading, setRoomLoading]   = useState(false);
  const [roomError, setRoomError]       = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [codeCopied, setCodeCopied]     = useState(false);
  const [scannerOpen, setScannerOpen]   = useState(false);

  // Keep roomCode accessible in the unmount cleanup without stale closure
  const roomCodeRef = useRef<string | null>(null);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  // Set to true before navigating to TurnOrder so the unmount cleanup doesn't
  // tear down the channel — TurnOrder will reattach to it instead.
  const isNavigatingRef = useRef(false);

  // Stable ref for Supabase callback — updated every render so it always closes over latest state
  const handleRemoteUpdateRef = useRef<(s: SyncState) => void>(() => undefined);

  // ── Keep handler ref fresh ────────────────────────────────────────────────
  useEffect(() => {
    handleRemoteUpdateRef.current = (state: SyncState) => {
      if (state.schemaVersion !== SYNC_SCHEMA_VERSION) return;

      // ── Host broadcasts "turn-select" → everyone moves to TurnOrder ────────
      if (state.phase === "turn-select") {
        isNavigatingRef.current = true; // keep channel alive for TurnOrder to reattach
        onMpPhaseChange(
          "turn-select",
          state.lobbyPlayers ?? lobbyPlayers,
          roomCode ?? undefined,
          roomRole ?? undefined,
        );
        return;
      }

      // ── Lobby player list sync ─────────────────────────────────────────────
      if (state.phase === "lobby" && state.lobbyPlayers) {
        if (roomRole === "host") {
          // Host: merge incoming updates and re-broadcast canonical list
          setLobbyPlayers(prev => {
            const merged = mergeLobbyPlayers(prev, state.lobbyPlayers!);
            const code = roomCodeRef.current;
            if (code) {
              setTimeout(() => {
                broadcastState(code, buildLobbyBroadcast(merged, "lobby-host"));
              }, 80); // slight delay avoids immediate echo loops
            }
            return merged;
          });
        } else {
          // Guest: trust the host's canonical list
          setLobbyPlayers(state.lobbyPlayers);
        }
      }
    };
  });

  // ── Cleanup: only tear down channel on explicit leave, not on phase transition ──
  // When navigating to TurnOrder, isNavigatingRef is set so TurnOrder can reattach.
  useEffect(() => () => {
    if (!isNavigatingRef.current && roomCodeRef.current) leaveRoom(roomCodeRef.current);
  }, []);

  // ── Auto-join from QR code deep-link ─────────────────────────────────────
  useEffect(() => {
    const code = localStorage.getItem("nexus_qr_join_code");
    if (!code) return;
    localStorage.removeItem("nexus_qr_join_code");
    setJoinCodeInput(code);
    // Slight delay so the component is fully mounted before joining
    const t = setTimeout(() => handleJoinRoom(code), 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Guest catch-up poll: navigate to TurnOrder even if "All In" broadcast was missed ──
  useEffect(() => {
    if (!roomCode || roomRole !== "guest") return;
    let alive = true;
    const poll = setInterval(() => {
      fetchPersistedState(roomCode).then(saved => {
        if (!alive || !saved) return;
        if (saved.schemaVersion !== SYNC_SCHEMA_VERSION) return;
        if (Date.now() - saved.updatedAt >= 5 * 60_000) return;
        if (saved.phase === "turn-select" || saved.phase === "game") {
          clearInterval(poll);
          isNavigatingRef.current = true;
          onMpPhaseChange("turn-select", saved.lobbyPlayers ?? [], roomCode, "guest");
        }
      });
    }, 6_000);
    return () => { alive = false; clearInterval(poll); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, roomRole]);

  // ── Room actions ─────────────────────────────────────────────────────────

  const handleCreateRoom = async () => {
    if (!isSupabaseConfigured) return;
    setRoomLoading(true);
    setRoomError(null);
    const code = generateRoomCode();
    const hostPlayer: LobbyPlayer = {
      deviceId:      getDeviceId(),
      playerName:    localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME) || "Player",
      colorName:     "purple",
      commanderName: "",
      isHost:        true,
      isReady:       false,
    };
    try {
      const ok = await createRoom(
        code,
        s => handleRemoteUpdateRef.current(s),
        () => undefined, // connection status handled within GameNight UI
      );
      if (ok) {
        setRoomCode(code);
        setRoomConnected(true);
        setRoomRole("host");
        setLobbyPlayers([hostPlayer]);
        setPhase("lobby");
        localStorage.setItem(STORAGE_KEYS.ROOM_CODE, code);
        localStorage.setItem(STORAGE_KEYS.ROOM_ROLE, "host");
        // Broadcast initial lobby so guests that join immediately see the host
        broadcastState(code, buildLobbyBroadcast([hostPlayer], hostPlayer.playerName));
        showToast(`Room ${code} created — share this code!`, "success");
      } else {
        setRoomError("Could not create room. Check your connection and try again.");
      }
    } catch {
      setRoomError("Could not create room. Check your connection and try again.");
    } finally {
      setRoomLoading(false);
    }
  };

  const handleJoinRoom = async (overrideCode?: string) => {
    const code = (overrideCode ?? joinCodeInput).trim().toUpperCase();
    if (!code || !isSupabaseConfigured) return;
    setRoomLoading(true);
    setRoomError(null);
    try {
      const ok = await joinSyncRoom(
        code,
        s => handleRemoteUpdateRef.current(s),
        () => undefined,
      );
      if (ok) {
        const selfPlayer: LobbyPlayer = {
          deviceId:      getDeviceId(),
          playerName:    localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME) || "Player",
          colorName:     "blue",
          commanderName: "",
          isHost:        false,
          isReady:       false,
        };
        setRoomCode(code);
        setRoomConnected(true);
        setRoomRole("guest");
        setLobbyPlayers([selfPlayer]);
        setPhase("lobby");
        localStorage.setItem(STORAGE_KEYS.ROOM_CODE, code);
        localStorage.setItem(STORAGE_KEYS.ROOM_ROLE, "guest");
        // Announce self so the host can merge us into the canonical lobby list
        broadcastState(code, buildLobbyBroadcast([selfPlayer], selfPlayer.playerName));
      } else {
        setRoomError("Room not found — double-check the code and try again.");
      }
      if (!overrideCode) setJoinCodeInput("");
    } catch {
      setRoomError("Could not join room. Check your connection and try again.");
    } finally {
      setRoomLoading(false);
    }
  };

  const handleLeaveRoom = () => {
    if (roomCode) leaveRoom(roomCode);
    setRoomCode(null);
    setRoomConnected(false);
    setRoomRole(null);
    setRoomError(null);
    setLobbyPlayers([]);
    setPhase("idle");
    localStorage.removeItem(STORAGE_KEYS.ROOM_CODE);
    localStorage.removeItem(STORAGE_KEYS.ROOM_ROLE);
  };

  // ── Lobby callbacks ───────────────────────────────────────────────────────

  /** Any player updating their own name / color / commander / ready state. */
  const handleUpdateLobbyPlayer = (updates: Partial<LobbyPlayer>) => {
    const deviceId = getDeviceId();
    setLobbyPlayers(prev => {
      const updated = prev.map(p => p.deviceId === deviceId ? { ...p, ...updates } : p);
      if (roomCode) {
        const me = updated.find(p => p.deviceId === deviceId);
        broadcastState(roomCode, buildLobbyBroadcast(updated, me?.playerName ?? "Player"));
      }
      return updated;
    });
  };

  /** Host clicks "All In — Start!" → transition everyone to TurnOrder. */
  const handleLobbyStart = () => {
    if (!roomCode) return;
    const payload = {
      schemaVersion: SYNC_SCHEMA_VERSION,
      players: [] as never[],
      activeCounters: EMPTY_COUNTERS,
      dayNightState: "none" as const,
      updatedAt: Date.now(),
      updatedBy: "host",
      phase: "turn-select" as const,
      lobbyPlayers,
    };
    broadcastState(roomCode, payload);
    // Persist so guests who missed the ephemeral broadcast catch up via the 6 s poll
    persistState(roomCode, payload);
    isNavigatingRef.current = true; // keep channel alive for TurnOrder to reattach
    onMpPhaseChange("turn-select", lobbyPlayers, roomCode, "host");
  };

  const copyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).catch(() => undefined);
    setCodeCopied(true);
    showToast(`Copied ${roomCode} to clipboard!`, "success");
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // ── Render: Lobby phase ───────────────────────────────────────────────────

  if (phase === "lobby" && roomConnected && roomCode) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", height: "calc(100dvh - 48px)", overflow: "hidden" }}>

        {/* Header bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Sparkles size={20} color="var(--accent-purple)" />
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, lineHeight: 1 }}>Game Night</h2>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic" }}>
              {roomRole === "host" ? "👑 Host" : "🎮 Guest"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {/* LIVE badge */}
            <div style={{
              display: "flex", alignItems: "center", gap: "5px",
              background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: "20px", padding: "3px 10px",
            }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", animation: "pulse-glow 1.5s infinite" }} />
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#10b981", letterSpacing: "0.5px" }}>LIVE</span>
            </div>

            {/* Room code + copy */}
            <button
              onClick={copyCode}
              title={codeCopied ? "Copied!" : "Copy room code"}
              style={{
                background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)",
                borderRadius: "8px", padding: "4px 10px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "5px",
                fontFamily: "monospace", fontWeight: 800, letterSpacing: "3px",
                fontSize: "0.95rem", color: codeCopied ? "#10b981" : "var(--accent-purple)",
              }}
            >
              {codeCopied ? <Check size={13} /> : <Copy size={13} />}
              {roomCode}
            </button>

            {/* Leave */}
            <button
              onClick={handleLeaveRoom}
              className="glass-button"
              style={{ padding: "5px 10px", fontSize: "0.78rem", background: "rgba(244,63,94,0.08)", borderColor: "rgba(244,63,94,0.2)", color: "var(--accent-rose)" }}
            >
              <WifiOff size={13} />
              <span>Leave</span>
            </button>
          </div>
        </div>

        {/* QR code for host — lets guests scan instead of typing */}
        {roomRole === "host" && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <RoomQRCode roomCode={roomCode} size={100} />
          </div>
        )}

        {/* LobbyPanel fills remaining height */}
        <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
          <LobbyPanel
            roomCode={roomCode}
            isHost={roomRole === "host"}
            selfPlayer={
              lobbyPlayers.find(p => p.deviceId === getDeviceId()) ?? {
                deviceId:      getDeviceId(),
                playerName:    localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME) || "Player",
                colorName:     roomRole === "host" ? "purple" : "blue",
                commanderName: "",
                isHost:        roomRole === "host",
                isReady:       false,
              }
            }
            allPlayers={lobbyPlayers}
            onUpdateSelf={handleUpdateLobbyPlayer}
            onStart={handleLobbyStart}
            onLeave={handleLeaveRoom}
            canHostPod={canHostPod}
          />
        </div>
      </div>
    );
  }

  // ── Render: Idle / landing ────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "680px", margin: "0 auto", width: "100%", padding: "12px" }}>

      {scannerOpen && (
        <QRScanner
          onScan={(code) => {
            setJoinCodeInput(code);
            setScannerOpen(false);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {/* Page title */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
        <Sparkles size={28} color="var(--accent-purple)" />
        <div>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 700 }}>Game Night</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Full pre-game setup — choose commanders, spin to pick who goes first, then jump straight into the life counter.
          </p>
        </div>
      </div>

      {!isSupabaseConfigured ? (
        <div className="glass-panel" style={{ padding: "24px", textAlign: "center" }}>
          <Wifi size={32} color="var(--text-muted)" style={{ marginBottom: "12px", opacity: 0.4 }} />
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Multiplayer requires Supabase. Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your <code>.env</code> file.
          </p>
        </div>
      ) : (
        <>
          {/* Host / Join cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>

            {/* Host a Game */}
            <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Crown size={18} color="#eab308" />
                <span style={{ fontWeight: 700, fontSize: "1rem" }}>Host a Game</span>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: 1.55, flex: 1 }}>
                Create a room and share the 4-letter code. Everyone joins on their own device, sets their commander, and readies up before the game begins.
              </p>
              <button
                onClick={handleCreateRoom}
                disabled={roomLoading}
                className="glass-button"
                style={{
                  padding: "10px 16px", fontWeight: 700,
                  background: "rgba(139,92,246,0.15)", borderColor: "rgba(139,92,246,0.4)",
                  color: "var(--accent-purple)",
                }}
              >
                <Wifi size={15} />
                <span>{roomLoading ? "Creating…" : "Create Room"}</span>
              </button>
            </div>

            {/* Join a Game */}
            <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={18} color="var(--accent-cyan)" />
                <span style={{ fontWeight: 700, fontSize: "1rem" }}>Join a Game</span>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: 1.55, flex: 1 }}>
                Enter the 4-letter room code from your host to jump into their lobby and get set up.
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setScannerOpen(true)}
                  className="glass-button"
                  title="Scan QR code"
                  style={{ padding: "8px 10px", flexShrink: 0 }}
                >
                  <QrCode size={16} />
                </button>
                <input
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  className="glass-input"
                  placeholder="ABCD"
                  value={joinCodeInput}
                  maxLength={4}
                  onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter") handleJoinRoom(); }}
                  style={{
                    flex: 1, padding: "8px 10px", fontWeight: 800,
                    letterSpacing: "4px", fontSize: "1rem", textAlign: "center",
                  }}
                />
                <button
                  onClick={() => handleJoinRoom()}
                  disabled={joinCodeInput.trim().length < 4 || roomLoading}
                  className="glass-button"
                  style={{ padding: "8px 14px" }}
                >
                  Join
                </button>
              </div>
            </div>
          </div>

          {roomError && (
            <p style={{ color: "var(--accent-rose)", fontSize: "0.85rem", textAlign: "center", fontWeight: 500 }}>
              ⚠️ {roomError}
            </p>
          )}
        </>
      )}

      {/* How it works */}
      <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          How it works
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          {[
            { emoji: "🏰", step: "1. Host",  desc: "Create a room and share the 4-letter code" },
            { emoji: "👥", step: "2. Join",  desc: "Everyone opens Game Night and enters the code" },
            { emoji: "⚔️", step: "3. Setup", desc: "Choose your color and commander, then tap Ready" },
            { emoji: "🎲", step: "4. Spin",  desc: "Spin the wheel — who goes first is decided for you" },
          ].map(({ emoji, step, desc }) => (
            <div key={step} style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "2rem" }}>{emoji}</span>
              <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)" }}>{step}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.45 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tip: regular LifeCounter */}
      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center", lineHeight: 1.5 }}>
        Just want to track life without the setup?{" "}
        <span style={{ color: "var(--text-secondary)" }}>
          The <strong>Life Counter</strong> tab has simple room sync — create or join a room and all life totals stay in sync instantly, no lobby required.
        </span>
      </p>
    </div>
  );
};
