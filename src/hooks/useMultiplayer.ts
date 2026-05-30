/**
 * useMultiplayer — extracts all Supabase Realtime sync logic from LifeCounter.tsx
 * into a reusable hook.
 *
 * Responsibilities:
 *  • Manages room state (code, role, connected/reconnecting, error)
 *  • Debounced broadcast of local game-state changes
 *  • Receives remote updates and calls back into LifeCounter via option callbacks
 *  • Auto-rejoin on mount and on visibility change
 *
 * Reconnect robustness (Fixes A–D):
 *  Fix A — State request / catch-up: on reconnect, ask peers for current state
 *           and suppress our own stale broadcasts for 3 s while catching up.
 *  Fix B — Longer retry backoff: up to 5 attempts / ~52 s (in multiplayerSync.ts).
 *  Fix C — Seat claim broadcast: announce seat ownership to peers on reconnect.
 *  Fix D — DB persistence: every broadcast also writes to `game_states` table;
 *           on reconnect, DB snapshot is read as fallback if no peer responds.
 */

import { useState, useRef, useEffect } from "react";
import { useToast } from "../components/Toast";
import {
  generateUniqueRoomCode,
  createRoom,
  joinRoom as joinSyncRoom,
  subscribeWithRetry,
  broadcastState,
  leaveRoom,
  reattachHandler,
  SYNC_SCHEMA_VERSION,
  sendStateRequest,
  onStateRequest,
  broadcastSeatClaim,
  onSeatClaim,
  broadcastHeartbeat,
  onHeartbeat,
  broadcastGameEnd,
  onGameEnd,
  persistState,
  fetchPersistedState,
} from "../services/multiplayerSync";
import type { SyncState, ConnectionStatus } from "../services/multiplayerSync";
import type { Player, ActiveCounters, DayNightState } from "../types/game";
import { isSupabaseConfigured } from "../services/supabase";
import { getDeviceId } from "../services/auth";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { App as CapApp } from "@capacitor/app";

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseMultiplayerOptions {
  players:           Player[];
  activeCounters:    ActiveCounters;
  dayNightState:     DayNightState;
  startingLife:      number;
  onRemotePlayers:   (players: Player[]) => void;
  onRemoteCounters:  (counters: ActiveCounters) => void;
  onRemoteDayNight:  (state: DayNightState) => void;
  onHostEndedGame?:  () => void;
}

// ── Return shape ──────────────────────────────────────────────────────────────

export interface UseMultiplayerReturn {
  roomCode:          string | null;
  roomConnected:     boolean;
  roomRole:          "host" | "guest" | null;
  roomName:          string;
  setRoomName:       (name: string) => void;
  joinCodeInput:     string;
  setJoinCodeInput:  (v: string) => void;
  roomLoading:       boolean;
  roomCopied:        boolean;
  roomError:         string | null;
  roomReconnecting:  boolean;
  heartbeatTimes:    Map<number, number>;
  scheduleBroadcast:  () => void;
  handleCreateRoom:   () => void;
  handleJoinRoom:     (overrideCode?: string) => void;
  handleLeaveRoom:    () => void;
  handleHostEndGame:  () => void;
  copyRoomCode:       () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMultiplayer(options: UseMultiplayerOptions): UseMultiplayerReturn {
  const { showToast } = useToast();

  // ── State ──
  const [roomCode, setRoomCode]               = useState<string | null>(null);
  const [roomConnected, setRoomConnected]     = useState(false);
  const [roomRole, setRoomRole]               = useState<"host" | "guest" | null>(null);
  const [roomName, setRoomName]               = useState("");
  const [joinCodeInput, setJoinCodeInput]     = useState("");
  const [roomLoading, setRoomLoading]         = useState(false);
  const [roomCopied, setRoomCopied]           = useState(false);
  const [roomError, setRoomError]             = useState<string | null>(null);
  const [roomReconnecting, setRoomReconnecting] = useState(false);
  const [heartbeatTimes, setHeartbeatTimes]     = useState<Map<number, number>>(() => new Map());

  // ── Refs ──
  // Tracks the updatedAt of the last state we applied from remote — prevents
  // replaying the same broadcast if the same payload arrives twice.
  const lastAppliedAt     = useRef<number>(0);
  // Tracks when the local user last made a game action — used for local-priority
  // (ignores remote updates for 500ms after a local change so your tap doesn't revert).
  const lastLocalChangeAt = useRef<number>(0);
  // Debounce timer for outgoing broadcasts (batches rapid taps into one message).
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable refs for async Supabase callbacks — avoids stale closures.
  const handleRemoteUpdateRef    = useRef<(s: SyncState) => void>(() => undefined);
  const handleConnectionStatusRef = useRef<(status: ConnectionStatus) => void>(() => undefined);
  // buildSyncStateRef is kept up-to-date via a useEffect so the 150ms setTimeout
  // inside scheduleBroadcast always reads the POST-render state, not the stale
  // pre-setPlayers snapshot captured at call time.
  const buildSyncStateRef = useRef<() => SyncState>(() => ({
    schemaVersion: SYNC_SCHEMA_VERSION,
    players: [],
    activeCounters: {} as ActiveCounters,
    dayNightState: "none",
    updatedAt: 0,
    updatedBy: "",
  }));

  // Heartbeat interval — broadcasts alive ping every 8 s while foregrounded
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fix A: suppress local broadcasts for 3 s after reconnect while catching up
  // from a peer or DB snapshot (prevents stale local state from overwriting live game).
  const isCatchingUp    = useRef(false);
  const catchUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirrors roomCode state — always current inside async Supabase callbacks
  // (state reads inside closures capture the value at closure-creation time).
  const roomCodeRef = useRef<string | null>(null);

  // Keep buildSyncStateRef fresh with the latest game-state values.
  // Use individual dep values (not the options object) so React can diff correctly.
  useEffect(() => {
    const { players, activeCounters, dayNightState } = options;
    buildSyncStateRef.current = () => ({
      schemaVersion: SYNC_SCHEMA_VERSION,
      players: players.map(p => ({ ...p, tokensOpen: false })),
      activeCounters,
      dayNightState,
      roomName: roomName || undefined,
      updatedAt: Date.now(),
      updatedBy: players[0]?.name ?? "Unknown",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.players, options.activeCounters, options.dayNightState, options.startingLife, roomName]);

  // ── Remote update handler ──
  const handleRemoteUpdate = (state: SyncState) => {
    // Discard payloads from a different schema version — prevents silent data
    // corruption when the Player shape changes in a future deploy.
    if (state.schemaVersion !== SYNC_SCHEMA_VERSION) return;
    if (state.updatedAt <= lastAppliedAt.current) return;
    lastAppliedAt.current = state.updatedAt;

    // Ignore pre-game lobby/turn-select broadcasts from GameNight — those are
    // handled by the GameNight and TurnOrder views, not the life counter.
    if (state.phase === "lobby" || state.phase === "turn-select") return;

    // Local-priority: if the local user tapped something in the last 500ms,
    // ignore the incoming state to prevent their change from reverting.
    if (Date.now() - lastLocalChangeAt.current < 500) return;

    // Fix A: a peer responded to our state_request — we have current game state,
    // stop suppressing our own broadcasts.
    if (isCatchingUp.current) {
      if (catchUpTimerRef.current) clearTimeout(catchUpTimerRef.current);
      isCatchingUp.current = false;
    }

    if (state.players && state.players.length > 0) options.onRemotePlayers(state.players);
    options.onRemoteCounters(state.activeCounters);
    options.onRemoteDayNight(state.dayNightState);
    if (state.roomName !== undefined) setRoomName(state.roomName);
  };

  // Keep both callback refs fresh on every render so async Supabase callbacks
  // always call the latest version of these functions.
  useEffect(() => {
    handleRemoteUpdateRef.current = handleRemoteUpdate;
    handleConnectionStatusRef.current = (status: ConnectionStatus) => {
      if (status === "reconnecting") {
        setRoomReconnecting(true);
        setRoomError(null);
      } else if (status === "connected") {
        setRoomReconnecting(false);
        setRoomConnected(true);
        setRoomError(null);

        const code = roomCodeRef.current;
        if (!code) return;

        // Fix A: enter catch-up mode — suppress our own broadcasts for 3 s while
        // waiting for a peer to push current state via state_request response.
        // Skip on fresh game start (lastAppliedAt === 0 means no prior remote state):
        // all devices have identical initial state so catch-up suppression just delays
        // the first broadcast and causes 3s of "nobody syncing" chaos.
        if (lastAppliedAt.current > 0) {
          isCatchingUp.current = true;
          if (catchUpTimerRef.current) clearTimeout(catchUpTimerRef.current);
          catchUpTimerRef.current = setTimeout(() => {
            isCatchingUp.current = false;
          }, 3_000);
        }

        // Ask connected peers for current state (arrives in ~50–100 ms).
        sendStateRequest(code);

        // Fix D: concurrently fetch DB snapshot — handles full-group disconnects
        // where no peer is available to respond to the state_request above.
        fetchPersistedState(code).then(saved => {
          if (!saved) return;
          if (saved.schemaVersion !== SYNC_SCHEMA_VERSION) return;
          if (saved.updatedAt <= lastAppliedAt.current) return;
          if (saved.phase === "lobby" || saved.phase === "turn-select") return;
          // Apply the DB snapshot as authoritative state
          lastAppliedAt.current = saved.updatedAt;
          if (saved.players && saved.players.length > 0) {
            options.onRemotePlayers(saved.players);
          }
          options.onRemoteCounters(saved.activeCounters);
          options.onRemoteDayNight(saved.dayNightState);
          // DB state received — done catching up
          if (catchUpTimerRef.current) clearTimeout(catchUpTimerRef.current);
          isCatchingUp.current = false;
        });

        // Fix C: announce seat ownership so peers can show a reconnect indicator.
        const myIndex = parseInt(
          localStorage.getItem(STORAGE_KEYS.MY_PLAYER_INDEX) ?? "-1",
          10,
        );
        if (myIndex >= 0) {
          const state = buildSyncStateRef.current();
          const playerName = state.players[myIndex]?.name ?? "Player";
          const role = (
            localStorage.getItem(STORAGE_KEYS.ROOM_ROLE) ?? "guest"
          ) as "host" | "guest";
          broadcastSeatClaim(code, {
            deviceId: getDeviceId(),
            playerIndex: myIndex,
            playerName,
            role,
          });
        }
      } else if (status === "failed") {
        setRoomReconnecting(false);
        setRoomConnected(false);
        setRoomError("Connection lost. Reconnecting when network returns…");
        // Pre-fill the join input with the saved room code so the user doesn't
        // have to retype it if automatic reconnect doesn't recover in time.
        const savedCode = localStorage.getItem(STORAGE_KEYS.ROOM_CODE);
        if (savedCode) setJoinCodeInput(savedCode);
      }
    };
  });

  // ── Debounced broadcast ──
  const scheduleBroadcast = () => {
    // Guard: don't broadcast while catching up — our local state may be stale
    // relative to changes peers made while we were disconnected.
    if (!roomConnected || !roomCode || isCatchingUp.current) return;
    lastLocalChangeAt.current = Date.now();
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(() => {
      const state = buildSyncStateRef.current();
      broadcastState(roomCode, state);
      // Fix D: write snapshot to DB (fire-and-forget — never awaited, never blocks UI).
      persistState(roomCode, state);
    }, 300);
  };

  // ── Heartbeat helpers ─────────────────────────────────────────────────────
  const _startHeartbeat = (code: string) => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    const myIndex = parseInt(localStorage.getItem(STORAGE_KEYS.MY_PLAYER_INDEX) ?? "-1", 10);
    const send = () => {
      if (document.visibilityState !== "visible") return;
      const idx = parseInt(localStorage.getItem(STORAGE_KEYS.MY_PLAYER_INDEX) ?? "-1", 10);
      if (idx < 0 || !roomCodeRef.current) return;
      broadcastHeartbeat(code, { playerIndex: idx });
      // Update local player's heartbeat time directly (broadcasts don't echo back to sender)
      setHeartbeatTimes(prev => new Map(prev).set(idx, Date.now()));
    };
    // Set local player immediately on connect, then pulse every 8 s
    if (myIndex >= 0) setHeartbeatTimes(prev => new Map(prev).set(myIndex, Date.now()));
    heartbeatIntervalRef.current = setInterval(send, 8_000);
  };

  const _stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    setHeartbeatTimes(new Map());
  };

  // ── Shared post-connect setup ──────────────────────────────────────────────
  // Called by both handleCreateRoom and handleJoinRoom after a successful subscribe.
  // Registers Fix A (state_request responder) and Fix C (seat_claim listener)
  // on the module-level handler Maps — these persist through channel recreation
  // on reconnects, so we only need to register once per room join.
  const _registerHandlers = (code: string) => {
    // Fix A: when a peer asks for state, push our current game state to them.
    onStateRequest(code, () => {
      const c = roomCodeRef.current;
      if (c) broadcastState(c, buildSyncStateRef.current());
    });

    // Fix C: surface seat claims from reconnecting peers as a brief toast.
    onSeatClaim(code, (claim) => {
      showToast(`${claim.playerName} joined`, "success");
    });

    // Presence: update heartbeat time for the peer that just pinged
    onHeartbeat(code, ({ playerIndex }) => {
      setHeartbeatTimes(prev => new Map(prev).set(playerIndex, Date.now()));
    });

    // Host ended game for everyone — guests reset their board
    onGameEnd(code, () => {
      showToast("Host ended the game", "info");
      options.onHostEndedGame?.();
    });

    _startHeartbeat(code);
  };

  // ── Room actions ──
  const handleCreateRoom = async () => {
    if (!isSupabaseConfigured) return;
    setRoomLoading(true);
    setRoomError(null);
    const code = await generateUniqueRoomCode();
    try {
      const ok = await createRoom(
        code,
        (s) => handleRemoteUpdateRef.current(s),
        (status) => handleConnectionStatusRef.current(status),
      );
      if (ok) {
        roomCodeRef.current = code;
        _registerHandlers(code);
        setRoomCode(code);
        setRoomConnected(true);
        setRoomRole("host");
        showToast(`Room ${code} created — life totals will sync in real time!`, "success");
        localStorage.setItem(STORAGE_KEYS.ROOM_CODE, code);
        localStorage.setItem(STORAGE_KEYS.ROOM_ROLE, "host");
      } else {
        setRoomError("Could not connect. Check your internet and try again.");
      }
    } catch {
      setRoomError("Could not connect. Check your internet and try again.");
    } finally {
      setRoomLoading(false);
    }
  };

  const handleJoinRoom = async (overrideCode?: string) => {
    const code = (overrideCode ?? joinCodeInput).trim().toUpperCase();
    if (!code || !isSupabaseConfigured) return;
    setRoomLoading(true);
    setRoomError(null);
    // Show the reconnecting banner for auto-rejoin (overrideCode) and manual
    // retry after a connection failure (not connected + had an error displayed).
    const isRetry = !roomConnected && roomError !== null;
    if (isRetry || overrideCode) setRoomReconnecting(true);

    // Reuse TurnOrder's channel if still active — eliminates the "Reconnecting" banner
    // and the 0.5–3 s window where life counter changes are lost.
    const reused = reattachHandler(code, (s) => handleRemoteUpdateRef.current(s));
    if (reused) {
      roomCodeRef.current = code;
      _registerHandlers(code);
      const role = overrideCode
        ? (localStorage.getItem(STORAGE_KEYS.ROOM_ROLE) as "host" | "guest" | null ?? "guest")
        : "guest";
      setRoomCode(code);
      setRoomConnected(true); // channel already subscribed — no handshake needed
      setRoomReconnecting(false);
      setRoomRole(role);
      setRoomLoading(false);
      if (!overrideCode) setJoinCodeInput("");
      // Request current game state so the guest sees the live layout immediately
      // (without this, they'd see stale state until the host next broadcasts).
      sendStateRequest(code);
      fetchPersistedState(code).then(saved => {
        if (!saved || saved.schemaVersion !== SYNC_SCHEMA_VERSION) return;
        if (saved.updatedAt <= lastAppliedAt.current) return;
        if (saved.phase === "lobby" || saved.phase === "turn-select") return;
        lastAppliedAt.current = saved.updatedAt;
        if (saved.players && saved.players.length > 0) {
          options.onRemotePlayers(saved.players);
        }
        options.onRemoteCounters(saved.activeCounters);
        options.onRemoteDayNight(saved.dayNightState);
      });
      return;
    }

    // No active channel — subscribe fresh (e.g. app reopen after background, page refresh)
    const ok = await joinSyncRoom(
      code,
      (s) => handleRemoteUpdateRef.current(s),
      (status) => handleConnectionStatusRef.current(status),
    );
    if (ok) {
      roomCodeRef.current = code;
      _registerHandlers(code);
      const role = overrideCode
        ? (localStorage.getItem(STORAGE_KEYS.ROOM_ROLE) as "host" | "guest" | null ?? "guest")
        : "guest";
      setRoomCode(code);
      setRoomConnected(true);
      setRoomRole(role);
      localStorage.setItem(STORAGE_KEYS.ROOM_CODE, code);
      localStorage.setItem(STORAGE_KEYS.ROOM_ROLE, role);
    } else if (!overrideCode) {
      // Only show error for manual joins — silent failure is fine for auto-rejoin
      setRoomError("Room not found or connection failed. Check the code and try again.");
    }
    setRoomLoading(false);
    if (!overrideCode) setJoinCodeInput("");
  };

  const handleLeaveRoom = () => {
    // Cancel any in-flight catch-up timer
    if (catchUpTimerRef.current) clearTimeout(catchUpTimerRef.current);
    isCatchingUp.current = false;
    _stopHeartbeat();

    if (roomCode) leaveRoom(roomCode); // also cleans up handler registrations
    roomCodeRef.current = null;
    setRoomCode(null);
    setRoomConnected(false);
    setRoomRole(null);
    setRoomError(null);
    setRoomReconnecting(false);
    lastAppliedAt.current = 0;
    lastLocalChangeAt.current = 0;
    localStorage.removeItem(STORAGE_KEYS.ROOM_CODE);
    localStorage.removeItem(STORAGE_KEYS.ROOM_ROLE);
    // NOTE: do NOT call clearPersistedState() here.
    // A player leaving ≠ the game ending. Other players may still be in the room.
    // clearPersistedState() is only called from handleEndGameConfirm() in LifeCounter.tsx.
  };

  const copyRoomCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).catch(() => undefined);
    setRoomCopied(true);
    showToast(`Room code ${roomCode} copied!`, "success");
    setTimeout(() => setRoomCopied(false), 2000);
  };

  // ── Auto-rejoin on mount (app reopened after close) ──
  useEffect(() => {
    const savedCode = localStorage.getItem(STORAGE_KEYS.ROOM_CODE);
    if (!savedCode || !isSupabaseConfigured) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleJoinRoom(savedCode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once on mount only

  // ── Auto-rejoin on visibility change (phone screen on / tab refocus) ──
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const savedCode = localStorage.getItem(STORAGE_KEYS.ROOM_CODE);
      if (!savedCode || !isSupabaseConfigured || roomConnected) return;
      handleJoinRoom(savedCode);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomConnected]);

  // ── Auto-rejoin on Capacitor app resume (iOS OS suspension → foreground) ──
  // visibilitychange fires in browser tabs but misses hard iOS suspensions where
  // the OS kills the WebSocket. CapApp.appStateChange catches those resumes.
  useEffect(() => {
    let listener: Awaited<ReturnType<typeof CapApp.addListener>> | null = null;
    CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      const savedCode = localStorage.getItem(STORAGE_KEYS.ROOM_CODE);
      if (!savedCode || !isSupabaseConfigured || roomConnected) return;
      handleJoinRoom(savedCode);
    }).then(l => { listener = l; }).catch(() => {
      // Not running in Capacitor (web) — no-op
    });
    return () => { listener?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomConnected]);

  // ── Auto-rejoin on network recovery ──
  // When the device comes back online after being fully offline, fire subscribeWithRetry
  // directly so we get the full exponential-backoff retry loop rather than a single attempt.
  useEffect(() => {
    const handleOnline = () => {
      const savedCode = localStorage.getItem(STORAGE_KEYS.ROOM_CODE);
      if (!savedCode || !isSupabaseConfigured || roomConnected) return;
      setRoomReconnecting(true);
      setRoomError(null);
      subscribeWithRetry(
        savedCode,
        (s) => handleRemoteUpdateRef.current(s),
        (status) => handleConnectionStatusRef.current(status),
      ).catch(() => {
        // handleConnectionStatusRef "failed" path handles the UI update
      });
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [roomConnected]);

  const handleHostEndGame = () => {
    const code = roomCodeRef.current;
    if (code) broadcastGameEnd(code);
    options.onHostEndedGame?.();
  };

  return {
    roomCode,
    roomConnected,
    roomRole,
    roomName,
    setRoomName,
    joinCodeInput,
    setJoinCodeInput,
    roomLoading,
    roomCopied,
    roomError,
    roomReconnecting,
    heartbeatTimes,
    scheduleBroadcast,
    handleCreateRoom,
    handleJoinRoom,
    handleLeaveRoom,
    handleHostEndGame,
    copyRoomCode,
  };
}
