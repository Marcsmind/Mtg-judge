/**
 * Unit tests for pure logic functions.
 * No React, no DOM, no network — just data in, data out.
 *
 * Run with: npm test
 */

import { describe, it, expect } from "vitest";
import { generateRoomCode, SYNC_SCHEMA_VERSION } from "../services/multiplayerSync";
import { parseSavedPlayer } from "../utils/playerUtils";
import { buildManaCurve } from "../views/DeckBuilder";

// ── generateRoomCode ──────────────────────────────────────────────────────────

describe("generateRoomCode", () => {
  it("returns exactly 4 characters", () => {
    expect(generateRoomCode()).toHaveLength(4);
  });

  it("uses only the safe alphabet (no I, 1, 0, O)", () => {
    // Run 200 times to catch statistical edge cases
    const SAFE_ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;
    for (let i = 0; i < 200; i++) {
      expect(generateRoomCode()).toMatch(SAFE_ALPHABET);
    }
  });

  it("produces different codes on successive calls", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRoomCode()));
    // With 32^4 = 1,048,576 possible codes, 50 calls should almost always yield > 40 unique ones
    expect(codes.size).toBeGreaterThan(40);
  });
});

// ── SYNC_SCHEMA_VERSION ───────────────────────────────────────────────────────

describe("SYNC_SCHEMA_VERSION", () => {
  it("is 1", () => {
    expect(SYNC_SCHEMA_VERSION).toBe(1);
  });
});

// ── parseSavedPlayer ──────────────────────────────────────────────────────────

describe("parseSavedPlayer", () => {
  it("reconstructs a fully populated player", () => {
    const raw = {
      id: 2, name: "Alice", avatar: "🐉", life: 35,
      tax: 2, taxPartner: 4, partnerMode: true,
      colorName: "blue",
      commanderDamage: { "1_A": 7 },
      isMonarch: true, hasInitiative: false, cityBlessing: false,
      poison: 3, rad: 1,
      tokens: { treasure: 5, food: 0, clue: 2, blood: 0 },
      enabledTokens: ["treasure", "clue"],
      tokensOpen: false,
    };
    const player = parseSavedPlayer(raw, 40);
    expect(player.id).toBe(2);
    expect(player.name).toBe("Alice");
    expect(player.avatar).toBe("🐉");
    expect(player.life).toBe(35);
    expect(player.tax).toBe(2);
    expect(player.taxPartner).toBe(4);
    expect(player.partnerMode).toBe(true);
    expect(player.colorName).toBe("blue");
    expect(player.commanderDamage).toEqual({ "1_A": 7 });
    expect(player.isMonarch).toBe(true);
    expect(player.poison).toBe(3);
    expect(player.rad).toBe(1);
    expect(player.tokens.treasure).toBe(5);
    expect(player.tokens.clue).toBe(2);
    expect(player.enabledTokens).toEqual(["treasure", "clue"]);
  });

  it("applies fallbackLife when raw.life is missing", () => {
    const raw = { id: 1 };
    const player = parseSavedPlayer(raw, 40);
    expect(player.life).toBe(40);
  });

  it("defaults name to 'Player {id}' when missing", () => {
    const raw = { id: 3 };
    expect(parseSavedPlayer(raw, 40).name).toBe("Player 3");
  });

  it("defaults avatar to empty string", () => {
    const raw = { id: 1 };
    expect(parseSavedPlayer(raw, 40).avatar).toBe("");
  });

  it("defaults poison and rad to 0", () => {
    const raw = { id: 1 };
    const p = parseSavedPlayer(raw, 40);
    expect(p.poison).toBe(0);
    expect(p.rad).toBe(0);
  });

  it("defaults enabledTokens to [] when missing or non-array", () => {
    expect(parseSavedPlayer({ id: 1 }, 40).enabledTokens).toEqual([]);
    expect(parseSavedPlayer({ id: 1, enabledTokens: null }, 40).enabledTokens).toEqual([]);
  });

  it("defaults all token counts to 0", () => {
    const raw = { id: 1 };
    const { tokens } = parseSavedPlayer(raw, 40);
    expect(tokens.treasure).toBe(0);
    expect(tokens.food).toBe(0);
    expect(tokens.clue).toBe(0);
    expect(tokens.blood).toBe(0);
  });

  it("preserves partial token data from raw", () => {
    const raw = { id: 1, tokens: { treasure: 3 } };
    expect(parseSavedPlayer(raw, 40).tokens.treasure).toBe(3);
    expect(parseSavedPlayer(raw, 40).tokens.food).toBe(0);
  });

  it("does not use fallbackLife when raw.life is 0", () => {
    const raw = { id: 1, life: 0 };
    expect(parseSavedPlayer(raw, 40).life).toBe(0);
  });
});

// ── buildManaCurve ────────────────────────────────────────────────────────────

describe("buildManaCurve", () => {
  const makeCard = (cmc: number, type_line?: string) => ({
    id: String(cmc), name: `Card${cmc}`, rulings_uri: "", scryfall_uri: "",
    cmc, type_line,
  });

  it("returns all 7 buckets initialised to 0 for an empty list", () => {
    const curve = buildManaCurve([]);
    expect(Object.keys(curve)).toEqual(["0", "1", "2", "3", "4", "5", "6+"]);
    expect(Object.values(curve).every(v => v === 0)).toBe(true);
  });

  it("places cards into correct CMC buckets", () => {
    const cards = [
      makeCard(1), makeCard(1), makeCard(3), makeCard(5), makeCard(6), makeCard(8),
    ];
    const curve = buildManaCurve(cards);
    expect(curve["1"]).toBe(2);
    expect(curve["3"]).toBe(1);
    expect(curve["5"]).toBe(1);
    expect(curve["6+"]).toBe(2); // cmc 6 and 8 both land here
  });

  it("skips null entries", () => {
    const cards = [null, makeCard(2), null];
    expect(buildManaCurve(cards)["2"]).toBe(1);
  });

  it("skips land cards (even cmc-0 lands)", () => {
    const land = makeCard(0, "Basic Land — Forest");
    const nonLand = makeCard(0, "Artifact");
    const curve = buildManaCurve([land, nonLand]);
    expect(curve["0"]).toBe(1); // only the artifact
  });

  it("handles fractional CMC by flooring", () => {
    // Meld cards and some split cards can have fractional CMC in the API
    const halfCmc = makeCard(1.5);
    const curve = buildManaCurve([halfCmc]);
    expect(curve["1"]).toBe(1);
  });
});
