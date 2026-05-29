/**
 * Deck service — localStorage CRUD + Supabase cloud sync.
 *
 * Local functions (loadDecks, saveDecks, addDeck, etc.) remain unchanged
 * and always operate on localStorage. Cloud functions are additive — call
 * them when the user is authenticated to sync data across devices.
 *
 * Migration path: call migrateLocalDecksToCloud(userId) once after a user
 * signs in for the first time to upload their existing localStorage decks.
 */

import type { SavedDeck, DeckCard } from "../types/deck";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { supabase, isSupabaseConfigured } from "./supabase";

// crypto.randomUUID is unavailable in iOS WKWebView before iOS 15.4
function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Read / Write ───────────────────────────────────────────────────────────────

export function loadDecks(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED_DECKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDecks(decks: SavedDeck[]): void {
  localStorage.setItem(STORAGE_KEYS.SAVED_DECKS, JSON.stringify(decks));
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export function addDeck(
  deck: Omit<SavedDeck, "id" | "createdAt" | "gamesPlayed" | "wins">
): SavedDeck {
  const newDeck: SavedDeck = {
    ...deck,
    id: makeId(),
    createdAt: Date.now(),
    gamesPlayed: 0,
    wins: 0,
  };
  saveDecks([...loadDecks(), newDeck]);
  return newDeck;
}

export function updateDeck(id: string, updates: Partial<SavedDeck>): void {
  saveDecks(loadDecks().map(d => (d.id === id ? { ...d, ...updates } : d)));
}

export function deleteDeck(id: string): void {
  saveDecks(loadDecks().filter(d => d.id !== id));
}

// ── Win tracking ───────────────────────────────────────────────────────────────

/**
 * Called at game-end for each player slot that has a deckId.
 * Increments gamesPlayed (always) and wins (when won === true).
 */
export function recordDeckResult(id: string, won: boolean): void {
  const decks = loadDecks();
  const idx = decks.findIndex(d => d.id === id);
  if (idx === -1) return; // deck was deleted — ignore
  decks[idx] = {
    ...decks[idx],
    gamesPlayed: decks[idx].gamesPlayed + 1,
    wins: decks[idx].wins + (won ? 1 : 0),
  };
  saveDecks(decks);
}

export function getDeck(id: string): SavedDeck | undefined {
  return loadDecks().find(d => d.id === id);
}

// ── Cloud Sync (Supabase) ──────────────────────────────────────────────────────
// These functions are additive — existing localStorage functions are unchanged.
// Call them in the UI when the user is authenticated to enable cross-device sync.

type DbDeckRow = {
  id: string;
  user_id: string;
  name: string;
  commander_name: string;
  partner_name: string | null;
  notes: string | null;
  cards: DeckCard[] | null;
  games_played: number;
  wins: number;
  created_at: string;
  updated_at: string;
};

function toDbRow(userId: string, deck: SavedDeck): Omit<DbDeckRow, 'updated_at'> & { updated_at: string } {
  return {
    id: deck.id,
    user_id: userId,
    name: deck.name,
    commander_name: deck.commanderName,
    partner_name: deck.partnerName ?? null,
    notes: deck.notes ?? null,
    cards: deck.cards ?? null,
    games_played: deck.gamesPlayed,
    wins: deck.wins,
    created_at: new Date(deck.createdAt).toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function fromDbRow(row: DbDeckRow): SavedDeck {
  return {
    id: row.id,
    name: row.name,
    commanderName: row.commander_name,
    partnerName: row.partner_name ?? undefined,
    notes: row.notes ?? undefined,
    cards: row.cards ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    gamesPlayed: row.games_played,
    wins: row.wins,
  };
}

/** Fetch all cloud-synced decks for an authenticated user. */
export async function loadDecksFromCloud(userId: string): Promise<SavedDeck[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("saved_decks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as DbDeckRow[]).map(fromDbRow);
}

/** Create or update a single deck in the cloud. */
export async function upsertDeckToCloud(userId: string, deck: SavedDeck): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("saved_decks")
    .upsert(toDbRow(userId, deck), { onConflict: "id" });
  if (error) console.error("[decks] upsertDeckToCloud:", error.message);
}

/** Delete a deck from the cloud by its ID. */
export async function deleteDeckFromCloud(deckId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("saved_decks").delete().eq("id", deckId);
  if (error) console.error("[decks] deleteDeckFromCloud:", error.message);
}

/**
 * One-time migration: upload all localStorage decks to Supabase.
 * Skips silently if the user already has cloud decks (prevents duplication
 * on repeated sign-ins).
 */
export async function migrateLocalDecksToCloud(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const localDecks = loadDecks();
  if (localDecks.length === 0) return;

  const { count } = await supabase
    .from("saved_decks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (count && count > 0) return; // already migrated — don't duplicate

  const rows = localDecks.map(deck => toDbRow(userId, deck));
  const { error } = await supabase.from("saved_decks").upsert(rows, { onConflict: "id" });
  if (error) console.error("[decks] migrateLocalDecksToCloud:", error.message);
}
