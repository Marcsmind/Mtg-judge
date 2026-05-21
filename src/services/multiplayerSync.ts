/**
 * Nexus Judge — Multiplayer Sync via Supabase Realtime Broadcast
 *
 * Uses ephemeral pub/sub channels — no database tables or schema needed.
 * Channel name: `game-${roomCode}`
 * Event:        `state_update`
 * Conflict:     last-write-wins (incoming `updatedAt > local updatedAt`)
 */

import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Shared state shape ────────────────────────────────────────────────────────

// Imported by LifeCounter — these must stay in sync with its local types.
// We redeclare them as `unknown` payloads to avoid a circular import; the
// consumer casts them back to the concrete types before using.
export interface SyncState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  players:        any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeCounters: any;
  dayNightState:  string;
  updatedAt:      number; // Date.now() — used for last-write-wins
  updatedBy:      string; // player name or device fingerprint
}

// ── Active channel registry ───────────────────────────────────────────────────

const channels: Map<string, RealtimeChannel> = new Map();

// ── Room code generator ───────────────────────────────────────────────────────

/** Returns a random 6-character uppercase alphanumeric room code, e.g. "X3KP7Q" */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous I/1/0/O
  let code = "";
  // Called from an event handler, not during render — Math.random() is fine here
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ── Create room ───────────────────────────────────────────────────────────────

/**
 * Creates (or re-joins) a room channel and subscribes to incoming state updates.
 * Returns true on success, false on any failure (mirrors joinRoom API).
 */
export async function createRoom(
  roomCode: string,
  onUpdate: (state: SyncState) => void
): Promise<boolean> {
  try {
    await _subscribeToRoom(roomCode, onUpdate);
    return true;
  } catch {
    return false;
  }
}

// ── Join room ────────────────────────────────────────────────────────────────

/**
 * Joins an existing room. Returns `true` on success, `false` if the channel
 * could not be established (e.g., no Supabase config).
 */
export async function joinRoom(
  code: string,
  onUpdate: (state: SyncState) => void
): Promise<boolean> {
  try {
    await _subscribeToRoom(code, onUpdate);
    return true;
  } catch {
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

/** Unsubscribes from the channel and removes it from the registry. */
export function leaveRoom(roomCode: string): void {
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

async function _subscribeToRoom(
  roomCode: string,
  onUpdate: (state: SyncState) => void
): Promise<void> {
  // Clean up any existing subscription for this room
  leaveRoom(roomCode);

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
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(status));
      }
    });
  });

  channels.set(roomCode, channel);
}
