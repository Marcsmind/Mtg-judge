/**
 * Nexus Judge — Multiplayer Sync via Supabase Realtime Broadcast
 *
 * Uses ephemeral pub/sub channels — no database tables or schema needed.
 * Channel name: `game-${roomCode}`
 * Event:        `state_update`
 * Conflict:     last-write-wins (incoming `updatedAt > local updatedAt`)
 *
 * Reconnection strategy
 * ─────────────────────
 * subscribeWithRetry() is the main entry point for callers. On any failure it
 * retries up to MAX_RECONNECT_ATTEMPTS times with exponential backoff:
 *   attempt 1 — wait 1 s  → attempt 2
 *   attempt 2 — wait 2 s  → attempt 3
 *   attempt 3 — wait 4 s  → give up, return false / fire onStatusChange("failed")
 *
 * Mid-session drops (CHANNEL_ERROR after initially being SUBSCRIBED) are also
 * caught inside _subscribeToRoom and fed back through the same retry cycle,
 * so brief network interruptions heal automatically without user action.
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

// ── Connection status type (forwarded to the UI layer) ───────────────────────
export type ConnectionStatus = "reconnecting" | "connected" | "failed";

// ── Reconnection config ───────────────────────────────────────────────────────
/** Milliseconds to wait before each successive retry attempt. */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000] as const;
const MAX_RECONNECT_ATTEMPTS = RECONNECT_DELAYS_MS.length;

// ── Active channel registry ───────────────────────────────────────────────────
const channels: Map<string, RealtimeChannel> = new Map();

/** Rooms that currently have a retry loop in progress — prevents parallel storms. */
const reconnecting: Set<string> = new Set();

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
 * Creates (or re-joins) a room channel. Delegates to subscribeWithRetry.
 * Returns true on success, false after all retries fail.
 */
export async function createRoom(
  roomCode: string,
  onUpdate: (state: SyncState) => void,
  onStatusChange?: (status: ConnectionStatus) => void,
): Promise<boolean> {
  return subscribeWithRetry(roomCode, onUpdate, onStatusChange);
}

// ── Join room ────────────────────────────────────────────────────────────────

/**
 * Joins an existing room. Delegates to subscribeWithRetry.
 * Returns true on success, false after all retries fail.
 */
export async function joinRoom(
  code: string,
  onUpdate: (state: SyncState) => void,
  onStatusChange?: (status: ConnectionStatus) => void,
): Promise<boolean> {
  return subscribeWithRetry(code, onUpdate, onStatusChange);
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
  // Clean up any existing subscription for this room
  const existing = channels.get(roomCode);
  if (existing) {
    supabase.removeChannel(existing);
    channels.delete(roomCode);
  }

  const channel = supabase.channel(`game-${roomCode}`, {
    config: { broadcast: { self: false } }, // don't echo our own sends back
  });

  channel.on(
    "broadcast",
    { event: "state_update" },
    ({ payload }: { payload: SyncState }) => {
      onUpdate(payload);
    }
  );

  let wasSubscribed = false;

  await new Promise<void>((resolve, reject) => {
    // 10-second hard timeout — prevents the UI from hanging forever if
    // Supabase never calls the callback (network drop, config issue, etc.)
    const timeout = setTimeout(
      () => reject(new Error("Connection timed out after 10 seconds")),
      10_000
    );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        wasSubscribed = true;
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (!wasSubscribed) {
          // Failed during initial handshake — reject so the retry loop can handle it
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

  channels.set(roomCode, channel);
}
