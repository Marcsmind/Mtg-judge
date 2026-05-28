/**
 * Nexus Judge — Multiplayer Sync via Supabase Realtime Broadcast
 *
 * Primary sync:  Supabase Realtime broadcast channels (ephemeral pub/sub).
 *                Channel name: `game-${roomCode}`, Event: `state_update`
 * Persistent:    Supabase Postgres `game_states` table — one row per active
 *                room, written on every broadcast, read on reconnect.
 *                Requires a one-time SQL migration (see MIGRATION.md).
 * Conflict:      last-write-wins (incoming `updatedAt > local updatedAt`)
 *
 * Reconnection strategy
 * ─────────────────────
 * subscribeWithRetry() is the main entry point for callers. On any failure it
 * retries up to MAX_RECONNECT_ATTEMPTS times with exponential backoff:
 *   attempt 1 — wait 2 s  → attempt 2
 *   attempt 2 — wait 5 s  → attempt 3
 *   attempt 3 — wait 15 s → attempt 4
 *   attempt 4 — wait 30 s → attempt 5
 *   attempt 5 — give up, return false / fire onStatusChange("failed")
 *
 * Mid-session drops (CHANNEL_ERROR after initially being SUBSCRIBED) are also
 * caught inside _subscribeToRoom and fed back through the same retry cycle,
 * so brief network interruptions heal automatically without user action.
 *
 * Catch-up protocol (Fix A)
 * ─────────────────────────
 * On reconnect, the device sends a `state_request` broadcast. Any connected
 * peer that receives it immediately broadcasts their current state back.
 * The reconnecting device suppresses its own outgoing broadcasts for 3 seconds
 * while waiting for a peer (or DB) response — preventing stale local state
 * from overwriting live game changes made while the device was offline.
 *
 * DB persistence (Fix D)
 * ──────────────────────
 * Every broadcast is also written to the `game_states` table (fire-and-forget).
 * On reconnect, the device reads that row concurrently with the Fix-A request.
 * This handles full-group disconnects where no peer is available to respond.
 */

import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Player, ActiveCounters, DayNightState, LobbyPlayer } from "../types/game";

// ── Schema version ────────────────────────────────────────────────────────────
// Bump this whenever the SyncState shape changes in a breaking way.
// handleRemoteUpdate in LifeCounter.tsx discards payloads with a mismatched
// version to prevent silent data corruption during rolling deploys.
export const SYNC_SCHEMA_VERSION = 2;

// ── Shared state shape ────────────────────────────────────────────────────────
export interface SyncState {
  schemaVersion:  number;   // Must equal SYNC_SCHEMA_VERSION — otherwise discard
  players:        Player[];
  activeCounters: ActiveCounters;
  dayNightState:  DayNightState;
  roomName?:      string;   // Optional host-set display name shown in LIVE badge
  updatedAt:      number;   // Date.now() — used for last-write-wins
  updatedBy:      string;   // player name or device fingerprint
  // ── Multiplayer lobby extensions ──────────────────────────────────────────
  phase?:         "lobby" | "turn-select" | "game";  // lifecycle phase
  lobbyPlayers?:  LobbyPlayer[];  // canonical player list during lobby phase
  mpSpinWinner?:  string;         // playerName chosen by the spin (turn-select phase)
}

// ── Seat ownership (Fix C) ────────────────────────────────────────────────────
/** Broadcast on reconnect so peers know which device controls which seat. */
export interface SeatClaim {
  deviceId:    string;
  playerIndex: number;
  playerName:  string;
  role:        "host" | "guest";
}

// ── Presence heartbeat ────────────────────────────────────────────────────────
/** Broadcast every 8 s to signal the device is still alive and foregrounded. */
export interface HeartbeatPayload {
  playerIndex: number;
}

// ── Connection status type (forwarded to the UI layer) ───────────────────────
export type ConnectionStatus = "reconnecting" | "connected" | "failed";

// ── Reconnection config ───────────────────────────────────────────────────────
/** Milliseconds to wait before each successive retry attempt.
 *  Extended to survive iOS background throttling, cell-tower handoffs, and
 *  venue WiFi drops that can take 10–30 s to recover.
 */
const RECONNECT_DELAYS_MS = [2_000, 5_000, 15_000, 30_000] as const;
const MAX_RECONNECT_ATTEMPTS = RECONNECT_DELAYS_MS.length + 1; // 5 total attempts

// ── Active channel registry ───────────────────────────────────────────────────
const channels: Map<string, RealtimeChannel> = new Map();

/**
 * Per-room state_update handler. Stored separately from `channels` so callers
 * can swap their callback at phase transitions (GameNight→TurnOrder→LifeCounter)
 * without recreating the underlying WebSocket connection.
 * See reattachHandler() below.
 */
const updateHandlers: Map<string, (state: SyncState) => void> = new Map();

/** Rooms that currently have a retry loop in progress — prevents parallel storms. */
const reconnecting: Set<string> = new Set();

// ── Per-room event handler registry (Fix A + Fix C) ──────────────────────────
// Stored at module level so they survive channel recreation during reconnects.
// _subscribeToRoom reads from these Maps each time it rebuilds the channel.

/** Called when a remote device sends `state_request` — we should push our state. */
const stateRequestHandlers: Map<string, () => void> = new Map();
/** Called when a remote device broadcasts `seat_claim`. */
const seatClaimHandlers: Map<string, (claim: SeatClaim) => void> = new Map();
/** Called when a remote device broadcasts `heartbeat`. */
const heartbeatHandlers: Map<string, (hb: HeartbeatPayload) => void> = new Map();
/** Called when the host broadcasts `game_end` — all guests should reset. */
const gameEndHandlers: Map<string, () => void> = new Map();

// ── Room code generator ───────────────────────────────────────────────────────

/** Returns a random 4-character uppercase alphanumeric room code, e.g. "X3KP" */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous I/1/0/O
  let code = "";
  // Called from an event handler, not during render — Math.random() is fine here
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ── Subscribe with exponential backoff ───────────────────────────────────────

/**
 * Connects to a room channel and subscribes to incoming state updates.
 * Retries up to MAX_RECONNECT_ATTEMPTS times with exponential backoff before
 * giving up.
 *
 * @param roomCode        - 4-character room identifier
 * @param onUpdate        - called for every incoming SyncState broadcast
 * @param onStatusChange  - optional UI callback: "reconnecting" | "connected" | "failed"
 * @returns true on success, false after all retry attempts are exhausted
 */
export async function subscribeWithRetry(
  roomCode: string,
  onUpdate: (state: SyncState) => void,
  onStatusChange?: (status: ConnectionStatus) => void,
): Promise<boolean> {
  // Bail out if a retry loop for this room is already running
  if (reconnecting.has(roomCode)) return false;
  reconnecting.add(roomCode);

  for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
    // Wait before every attempt after the first
    if (attempt > 0) {
      onStatusChange?.("reconnecting");
      await new Promise<void>(r =>
        setTimeout(r, RECONNECT_DELAYS_MS[attempt - 1])
      );
      // Abort if the room was explicitly closed while we were sleeping
      if (!reconnecting.has(roomCode)) return false;
    }

    try {
      await _subscribeToRoom(roomCode, onUpdate, () => {
        // Mid-session drop — kick off a fresh retry cycle (fire-and-forget)
        reconnecting.delete(roomCode);
        subscribeWithRetry(roomCode, onUpdate, onStatusChange);
      });
      reconnecting.delete(roomCode);
      onStatusChange?.("connected");
      return true;
    } catch {
      // Swallow and try next attempt
    }
  }

  // All attempts exhausted
  reconnecting.delete(roomCode);
  onStatusChange?.("failed");
  return false;
}

// ── Create room ───────────────────────────────────────────────────────────────

/**
 * Creates a room channel with a single attempt (max 10 s timeout).
 * Fast-fails so the UI doesn't hang — the caller shows an error and lets the
 * user retry manually. Mid-session drops are handled by subscribeWithRetry
 * via the onDropped callback registered inside _subscribeToRoom.
 */
export async function createRoom(
  roomCode: string,
  onUpdate: (state: SyncState) => void,
  onStatusChange?: (status: ConnectionStatus) => void,
): Promise<boolean> {
  try {
    await _subscribeToRoom(roomCode, onUpdate, () => {
      subscribeWithRetry(roomCode, onUpdate, onStatusChange);
    });
    onStatusChange?.("connected");
    return true;
  } catch (err) {
    console.error("[mp] createRoom failed:", err);
    onStatusChange?.("failed");
    return false;
  }
}

// ── Join room ────────────────────────────────────────────────────────────────

/**
 * Joins an existing room with a single attempt (max 10 s timeout).
 * Same rationale as createRoom — fast-fail for initial handshake, let
 * subscribeWithRetry handle mid-session reconnects via onDropped.
 */
export async function joinRoom(
  code: string,
  onUpdate: (state: SyncState) => void,
  onStatusChange?: (status: ConnectionStatus) => void,
): Promise<boolean> {
  try {
    await _subscribeToRoom(code, onUpdate, () => {
      subscribeWithRetry(code, onUpdate, onStatusChange);
    });
    onStatusChange?.("connected");
    return true;
  } catch {
    onStatusChange?.("failed");
    return false;
  }
}

// ── Broadcast state ──────────────────────────────────────────────────────────

/** Sends the current game state to all other players in the room. Fire-and-forget. */
export function broadcastState(roomCode: string, state: SyncState): void {
  const channel = channels.get(roomCode);
  if (!channel) return;
  channel.send({
    type: "broadcast",
    event: "state_update",
    payload: state,
  }).catch(() => { /* ignore send errors — transient network issue */ });
}

// ── Leave room ───────────────────────────────────────────────────────────────

/**
 * Unsubscribes from the channel, removes it from the registry, and cancels
 * any in-progress retry loop for this room.
 */
export function leaveRoom(roomCode: string): void {
  // Cancel any pending retry loop first so it doesn't revive the channel
  reconnecting.delete(roomCode);

  const channel = channels.get(roomCode);
  if (channel) {
    supabase.removeChannel(channel);
    channels.delete(roomCode);
  }

  // Clean up per-room event handlers
  updateHandlers.delete(roomCode);
  stateRequestHandlers.delete(roomCode);
  seatClaimHandlers.delete(roomCode);
  heartbeatHandlers.delete(roomCode);
  gameEndHandlers.delete(roomCode);
}

// ── Channel handler swap (phase-transition continuity) ───────────────────────

/**
 * Attaches a new state_update handler to an already-subscribed channel without
 * recreating the WebSocket connection. Returns true if the channel exists and
 * is active; false if the caller must fall back to subscribeWithRetry / joinRoom.
 *
 * Call at phase transitions (GameNight→TurnOrder, TurnOrder→LifeCounter) so the
 * channel created in GameNight stays alive all the way through to LifeCounter,
 * eliminating the 0.5–3 s reconnect window that caused missed spin/Begin-Game broadcasts.
 */
export function reattachHandler(
  roomCode: string,
  onUpdate: (state: SyncState) => void,
): boolean {
  if (!channels.has(roomCode)) return false;
  updateHandlers.set(roomCode, onUpdate);
  return true;
}

// ── Fix A: State request / catch-up protocol ─────────────────────────────────

/**
 * Broadcasts `state_request` to all peers in the room.
 * Call this immediately after reconnecting — peers will respond with a full
 * state broadcast, letting the reconnecting device catch up before it sends
 * any potentially-stale local state of its own.
 */
export function sendStateRequest(roomCode: string): void {
  const channel = channels.get(roomCode);
  if (!channel) return;
  channel.send({
    type: "broadcast",
    event: "state_request",
    payload: {},
  }).catch(() => { /* ignore — transient network, no retry needed */ });
}

/**
 * Registers a callback to fire when a remote peer sends `state_request`.
 * The callback should immediately call broadcastState() with the current game
 * state so the reconnecting peer can catch up.
 *
 * The handler is stored at module level and automatically re-registered on
 * every channel recreation (reconnect / mid-session drop). Call once at
 * setup time — no need to re-register on reconnect.
 */
export function onStateRequest(roomCode: string, callback: () => void): void {
  stateRequestHandlers.set(roomCode, callback);
}

// ── Fix C: Seat claim broadcast ───────────────────────────────────────────────

/**
 * Broadcasts `seat_claim` so peers know which device controls which player seat.
 * Call after reconnect, after sendStateRequest().
 */
export function broadcastSeatClaim(roomCode: string, claim: SeatClaim): void {
  const channel = channels.get(roomCode);
  if (!channel) return;
  channel.send({
    type: "broadcast",
    event: "seat_claim",
    payload: claim,
  }).catch(() => {});
}

/**
 * Registers a callback to fire when a remote device broadcasts `seat_claim`.
 * Like onStateRequest, the handler persists through reconnects automatically.
 */
export function onSeatClaim(roomCode: string, callback: (claim: SeatClaim) => void): void {
  seatClaimHandlers.set(roomCode, callback);
}

// ── Presence heartbeat ────────────────────────────────────────────────────────

/** Broadcasts a lightweight alive ping every 8 s so peers can show presence dots. */
export function broadcastHeartbeat(roomCode: string, payload: HeartbeatPayload): void {
  const channel = channels.get(roomCode);
  if (!channel) return;
  channel.send({
    type: "broadcast",
    event: "heartbeat",
    payload,
  }).catch(() => {});
}

/** Registers a callback for incoming heartbeat pings from remote devices. */
export function onHeartbeat(roomCode: string, callback: (hb: HeartbeatPayload) => void): void {
  heartbeatHandlers.set(roomCode, callback);
}

// ── Host end-game broadcast ───────────────────────────────────────────────────

/** Host broadcasts `game_end` to all guests so their boards reset without recording stats. */
export function broadcastGameEnd(roomCode: string): void {
  const channel = channels.get(roomCode);
  if (!channel) return;
  channel.send({
    type: "broadcast",
    event: "game_end",
    payload: {},
  }).catch(() => {});
}

/** Registers a callback to fire when the host broadcasts `game_end`. */
export function onGameEnd(roomCode: string, callback: () => void): void {
  gameEndHandlers.set(roomCode, callback);
}

// ── Fix D: Supabase DB persistence ───────────────────────────────────────────

/**
 * Writes the current game state to Supabase Postgres as a snapshot.
 * Fire-and-forget — never awaited on the hot broadcast path.
 *
 * The DB row is the fallback source of truth for full-group disconnects:
 * if no peer responds to state_request, the reconnecting device reads this
 * row instead and restores the last known good state.
 */
export async function persistState(roomCode: string, state: SyncState): Promise<void> {
  const { error } = await supabase
    .from("game_states")
    .upsert(
      { room_code: roomCode, state_json: state, updated_at: new Date().toISOString() },
      { onConflict: "room_code" },
    );
  if (error) console.warn("[mp] persistState failed:", error.message);
}

/**
 * Fetches the last persisted game state for a room from Supabase Postgres.
 * Returns `null` if no row exists or the row is older than 24 hours (stale game).
 *
 * Called on reconnect concurrently with sendStateRequest() — whichever
 * delivers a newer updatedAt wins via the existing last-write-wins guard.
 */
export async function fetchPersistedState(roomCode: string): Promise<SyncState | null> {
  const { data, error } = await supabase
    .from("game_states")
    .select("state_json, updated_at")
    .eq("room_code", roomCode)
    .single();

  if (error || !data) return null;

  // Discard rows older than 24 h — the game is effectively over
  const ageMs = Date.now() - new Date(data.updated_at as string).getTime();
  if (ageMs > 24 * 60 * 60 * 1_000) return null;

  return data.state_json as SyncState;
}

/**
 * Deletes the persisted game state for a room.
 * ONLY call from handleEndGameConfirm() — NOT from handleLeaveRoom().
 * A player leaving ≠ the game ending; state must survive individual disconnects.
 */
export async function clearPersistedState(roomCode: string): Promise<void> {
  const { error } = await supabase
    .from("game_states")
    .delete()
    .eq("room_code", roomCode);
  if (error) console.warn("[mp] clearPersistedState failed:", error.message);
}

// ── Channel status ───────────────────────────────────────────────────────────

/**
 * Returns the Supabase Realtime channel status for a room, e.g. "SUBSCRIBED",
 * "CLOSED", "CHANNEL_ERROR". Returns `null` if no channel is registered.
 * Useful for checking whether auto-rejoin is needed before calling joinRoom.
 */
export function getChannelStatus(roomCode: string): string | null {
  const channel = channels.get(roomCode);
  return channel ? channel.state : null;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Low-level: creates and subscribes to a single Supabase Realtime channel.
 * Does NOT retry on failure — callers should use subscribeWithRetry for that.
 *
 * @param onDropped - called if the channel fires CHANNEL_ERROR *after* being
 *   successfully SUBSCRIBED (i.e. a mid-session drop, not an initial failure).
 *   The caller can use this to trigger a reconnect cycle.
 */
async function _subscribeToRoom(
  roomCode: string,
  onUpdate: (state: SyncState) => void,
  onDropped?: () => void,
): Promise<void> {
  // Keep the existing channel in the map while we try to create a new one.
  // This means broadcastState() can still send via the old (potentially degraded)
  // channel during retry attempts instead of silently dropping every broadcast.
  // The old channel is only removed AFTER a new one successfully subscribes.

  const channel = supabase.channel(`game-${roomCode}`, {
    config: { broadcast: { self: false } }, // don't echo our own sends back
  });

  // Route through updateHandlers so reattachHandler() can swap callbacks at phase
  // transitions without recreating this channel.
  updateHandlers.set(roomCode, onUpdate);
  channel.on(
    "broadcast",
    { event: "state_update" },
    ({ payload }: { payload: SyncState }) => {
      updateHandlers.get(roomCode)?.(payload);
    }
  );

  // Fix A: A peer reconnected and is asking for current state — push it to them
  channel.on("broadcast", { event: "state_request" }, () => {
    stateRequestHandlers.get(roomCode)?.();
  });

  // Fix C: A peer is announcing their seat ownership after reconnect
  channel.on(
    "broadcast",
    { event: "seat_claim" },
    ({ payload }: { payload: SeatClaim }) => {
      seatClaimHandlers.get(roomCode)?.(payload);
    },
  );

  // Presence: a peer sent an alive ping
  channel.on(
    "broadcast",
    { event: "heartbeat" },
    ({ payload }: { payload: HeartbeatPayload }) => {
      heartbeatHandlers.get(roomCode)?.(payload);
    },
  );

  // Host ended the game for everyone — guests should reset
  channel.on("broadcast", { event: "game_end" }, () => {
    gameEndHandlers.get(roomCode)?.();
  });

  let wasSubscribed = false;

  try {
    await new Promise<void>((resolve, reject) => {
      // 15-second timeout — devices coming back from airplane mode / screen lock
      // may need up to 10–15 s for the Supabase WebSocket to fully reconnect.
      const timeout = setTimeout(
        () => reject(new Error("Connection timed out after 15 seconds")),
        15_000
      );

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          wasSubscribed = true;
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (!wasSubscribed) {
            // Failed during initial handshake — reject so the retry loop handles it
            clearTimeout(timeout);
            reject(new Error(status));
          } else {
            // Mid-session drop — channel was healthy before, now it's gone
            // Only fire onDropped if this room is still the active one (not manually closed)
            if (channels.has(roomCode)) {
              onDropped?.();
            }
          }
        }
      });
    });
  } catch (err) {
    // CRITICAL: clean up the failed channel so it doesn't accumulate as a leak.
    // Without this, each retry attempt leaves a dangling Supabase subscription that
    // consumes connection budget and can prevent future subscribes from succeeding.
    supabase.removeChannel(channel);
    throw err;
  }

  // Success: now replace the old channel with the new one.
  const existing = channels.get(roomCode);
  if (existing && existing !== channel) {
    supabase.removeChannel(existing);
  }
  channels.set(roomCode, channel);
  // updateHandlers was already set before channel.subscribe() so the handler is
  // active as soon as the first broadcast arrives after SUBSCRIBED.
}
