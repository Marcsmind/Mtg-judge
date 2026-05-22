/**
 * Unit tests for src/services/decks.ts
 *
 * Uses a lightweight in-memory localStorage mock so the decks service can
 * read/write storage without requiring a full DOM environment.
 * Each test starts with a clean store via beforeEach.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadDecks,
  addDeck,
  updateDeck,
  deleteDeck,
  recordDeckResult,
  getDeck,
} from "../services/decks";

// ── Minimal localStorage mock (node environment) ──────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem:    (key: string) => store[key] ?? null,
    setItem:    (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear:      () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key:        (i: number) => Object.keys(store)[i] ?? null,
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("decks service", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadDecks returns [] when nothing stored", () => {
    expect(loadDecks()).toEqual([]);
  });

  it("addDeck assigns id, createdAt, gamesPlayed=0, wins=0", () => {
    const deck = addDeck({ name: "Atraxa Infect", commanderName: "Atraxa, Praetors' Voice" });
    expect(deck.id).toBeTruthy();
    expect(deck.createdAt).toBeGreaterThan(0);
    expect(deck.gamesPlayed).toBe(0);
    expect(deck.wins).toBe(0);
    expect(deck.name).toBe("Atraxa Infect");
    expect(deck.commanderName).toBe("Atraxa, Praetors' Voice");
  });

  it("addDeck persists and is returned by loadDecks", () => {
    addDeck({ name: "Deck A", commanderName: "Commander A" });
    const loaded = loadDecks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("Deck A");
  });

  it("updateDeck changes only specified fields, leaves others intact", () => {
    const deck = addDeck({ name: "Original Name", commanderName: "Commander X" });
    updateDeck(deck.id, { name: "Updated Name" });
    const updated = getDeck(deck.id);
    expect(updated?.name).toBe("Updated Name");
    expect(updated?.commanderName).toBe("Commander X"); // unchanged
    expect(updated?.gamesPlayed).toBe(0);               // unchanged
  });

  it("deleteDeck removes deck by id; others remain", () => {
    const a = addDeck({ name: "Deck A", commanderName: "Cmd A" });
    const b = addDeck({ name: "Deck B", commanderName: "Cmd B" });
    deleteDeck(a.id);
    const remaining = loadDecks();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
  });

  it("recordDeckResult increments gamesPlayed regardless of outcome", () => {
    const deck = addDeck({ name: "My Deck", commanderName: "Commander" });
    recordDeckResult(deck.id, false);
    recordDeckResult(deck.id, false);
    expect(getDeck(deck.id)?.gamesPlayed).toBe(2);
  });

  it("recordDeckResult increments wins when won=true", () => {
    const deck = addDeck({ name: "My Deck", commanderName: "Commander" });
    recordDeckResult(deck.id, true);
    recordDeckResult(deck.id, true);
    recordDeckResult(deck.id, false);
    const d = getDeck(deck.id);
    expect(d?.gamesPlayed).toBe(3);
    expect(d?.wins).toBe(2);
  });

  it("recordDeckResult does NOT increment wins when won=false", () => {
    const deck = addDeck({ name: "My Deck", commanderName: "Commander" });
    recordDeckResult(deck.id, false);
    expect(getDeck(deck.id)?.wins).toBe(0);
  });

  it("getDeck returns undefined for unknown id", () => {
    expect(getDeck("non-existent-id")).toBeUndefined();
  });

  it("recordDeckResult silently ignores deleted deck id", () => {
    // Should not throw even if deck doesn't exist
    expect(() => recordDeckResult("ghost-id", true)).not.toThrow();
  });
});
