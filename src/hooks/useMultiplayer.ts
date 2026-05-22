/**
 * useMultiplayer — extracts all Supabase Realtime sync logic from LifeCounter.tsx
 * into a reusable hook.
 *
 * Responsibilities:
 *  • Manages room state (code, role, connected/reconnecting, error)
 *  • Debounced broadcast of local game-state changes
 *  • Receives remote updates and calls back into LifeCounter via option callbacks
 *  • Auto-rejoin on mount and on visibility change
 */

import { useState, useRef, useEffect } from "react";
import { useToast } from "../components/Toast";
import {
  generateRoomCode,
  createRoom,
  joinRoom as joinSyncRoom,
  broadcastState,
  leaveRoom,
  SYNC_SCHEMA_VERSION,
} from "../services/multiplayerSync";
import type { SyncState, ConnectionStatus } from "../services/multiplayerSync";
import type { Player, ActiveCounters, DayNightState } from "../types/game";
import { isSupabaseConfigured } from "../services/supabase";
import { STORAGE_KEYS } from "../constants/storageKeys";

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseMultiplayerOptions {
  players:          Player[];
  activeCounters:   ActiveCounters;
  dayNightState:    DayNightState;
  startingLife:     number;
  onRemotePlayers:  (players: Player[]) => void;
  onRemoteCounters: (counters: ActiveCounters) => void;
  onRemoteDayNight: (state: DayNightState) => void;
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
  scheduleBroadcast: () => void;
  handleCreateRoom:  () => void;
  handleJoinRoom:    (overrideCode?: string) => void;
  handleLeaveRoom:   () => void;
  copyRoomCode:      () => void;
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

  // Keep buildSyncStateRef fresh with the latest game-state values.
  // Use individual dep values (not the options object) so React can diff correctly.
  useEffect(() => {
    const { players, activeCounters, dayNightState } = options;
    buildSyncStateRef.current = () => ({
      schemaVersion: SYNC_SCHEMA_VERSION,
      players,
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
        setRoomError(null);
      } else if (status === "failed") {
        setRoomReconnecting(false);
        setRoomConnected(false);
        setRoomError("Connection lost. Tap to reconnect.");
      }
    };
  });

  // ── Debounced broadcast ──
  const scheduleBroadcast = () => {
    if (!roomConnected || !roomCode) return;
    lastLocalChangeAt.current = Date.now();
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(() => {
      broadcastState(roomCode, buildSyncStateRef.current());
      // Fire-and-forget: real-time sync errors are non-critical; swallowing them
      // is intentional so a flaky connection doesn't break the local game.
    }, 150);
  };

  // ── Room actions ──
  const handleCreateRoom = async () => {
    if (!isSupabaseConfigured) return;
    setRoomLoading(true);
    setRoomError(null);
    const code = generateRoomCode();
    try {
      const ok = await createRoom(
        code,
        (s) => handleRemoteUpdateRef.current(s),
        (status) => handleConnectionStatusRef.current(status),
      );
      if (ok) {
        setRoomCode(code);
        setRoomConnected(true);
        setRoomRole("host");
        showToast(`Room ${code} created — life totals will sync in real time!`, "success");
        localStorage.setItem(STORAGE_KEYS.ROOM_CODE, code);
        localStorage.setItem("nexus_judge_room_role", "host");
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
    const ok = await joinSyncRoom(
      code,
      (s) => handleRemoteUpdateRef.current(s),
      (status) => handleConnectionStatusRef.current(status),
    );
    if (ok) {
      const role = overrideCode
        ? (localStorage.getItem("nexus_judge_room_role") as "host" | "guest" | null ?? "guest")
        : "guest";
      setRoomCode(code);
      setRoomConnected(true);
      setRoomRole(role);
      localStorage.setItem(STORAGE_KEYS.ROOM_CODE, code);
      localStorage.setItem("nexus_judge_room_role", role);
    } else if (!overrideCode) {
      // Only show error for manual joins — silent failure is fine for auto-rejoin
      setRoomError("Room not found or connection failed. Check the code and try again.");
    }
    setRoomLoading(false);
    if (!overrideCode) setJoinCodeInput("");
  };

  const handleLeaveRoom = () => {
    if (roomCode) leaveRoom(roomCode);
    setRoomCode(null);
    setRoomConnected(false);
    setRoomRole(null);
    setRoomError(null);
    setRoomReconnecting(false);
    lastAppliedAt.current = 0;
    lastLocalChangeAt.current = 0;
    localStorage.removeItem(STORAGE_KEYS.ROOM_CODE);
    localStorage.removeItem("nexus_judge_room_role");
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
    scheduleBroadcast,
    handleCreateRoom,
    handleJoinRoom,
    handleLeaveRoom,
    copyRoomCode,
  };
}
