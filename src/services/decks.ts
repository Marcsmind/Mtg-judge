/**
 * Deck service — pure localStorage CRUD for SavedDeck records.
 * No React, no side effects; fully unit-testable.
 */

import type { SavedDeck } from "../types/deck";
import { STORAGE_KEYS } from "../constants/storageKeys";

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
  try {
    localStorage.setItem(STORAGE_KEYS.SAVED_DECKS, JSON.stringify(decks));
  } catch {
    // localStorage quota exceeded — fail silently
  }
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export function addDeck(
  deck: Omit<SavedDeck, "id" | "createdAt" | "gamesPlayed" | "wins">
): SavedDeck {
  const newDeck: SavedDeck = {
    ...deck,
    id: crypto.randomUUID(),
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
