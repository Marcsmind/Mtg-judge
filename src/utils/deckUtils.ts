/**
 * Pure deck-analysis utilities — no React, no side effects.
 * Exported here so they can be unit-tested without importing the full
 * DeckBuilder component tree.
 */

import type { ScryfallCard } from "../services/scryfall";

// ── Mana curve ────────────────────────────────────────────────────────────────

/** Build a mana-curve histogram: groups CMC 0–5 and "6+" */
export function buildManaCurve(cards: (ScryfallCard | null)[]): Record<string, number> {
  const curve: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6+": 0 };
  for (const card of cards) {
    if (!card) continue;
    // Skip lands (they have cmc 0 but skew the chart)
    if (card.type_line?.toLowerCase().includes("land")) continue;
    const cmc = card.cmc ?? 0;
    if (cmc >= 6) curve["6+"]++;
    else curve[String(Math.floor(cmc))]++;
  }
  return curve;
}

// ── Color identity spread ─────────────────────────────────────────────────────

export interface ColorMeta {
  label: string;
  color: string;
  bg:    string;
}

export const COLOR_META: Record<string, ColorMeta> = {
  W: { label: "White",     color: "#f9fafb", bg: "rgba(249,250,251,0.15)" },
  U: { label: "Blue",      color: "#38bdf8", bg: "rgba(56,189,248,0.15)"  },
  B: { label: "Black",     color: "#a855f7", bg: "rgba(168,85,247,0.15)"  },
  R: { label: "Red",       color: "#ef4444", bg: "rgba(239,68,68,0.15)"   },
  G: { label: "Green",     color: "#10b981", bg: "rgba(16,185,129,0.15)"  },
  C: { label: "Colorless", color: "#9ca3af", bg: "rgba(156,163,175,0.15)" },
};

/** Count how many cards require each color (W/U/B/R/G/C). */
export function buildColorSpread(cards: (ScryfallCard | null)[]): Record<string, number> {
  const counts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const c of cards) {
    if (!c) continue;
    if (!c.color_identity?.length) { counts.C++; continue; }
    for (const pip of c.color_identity) {
      if (pip in counts) counts[pip]++;
    }
  }
  return counts;
}

// ── Deck cost ─────────────────────────────────────────────────────────────────

export interface DeckCost {
  total:     number;  // sum of all card USD prices
  priced:    number;  // cards that have a price
  unpriced:  number;  // cards with no price data
}

/** Sum USD prices for all non-null cards. Returns total, priced count, unpriced count. */
export function calcDeckCost(cards: (ScryfallCard | null)[]): DeckCost {
  let total = 0, priced = 0, unpriced = 0;
  for (const c of cards) {
    if (!c) continue;
    const price = parseFloat(c.prices?.usd ?? "");
    if (!isNaN(price)) { total += price; priced++; }
    else { unpriced++; }
  }
  return { total, priced, unpriced };
}

// ── Moxfield format ───────────────────────────────────────────────────────────

/** Converts a list of card names to Moxfield / MTGO import format ("1 CardName" per line). */
export function toMoxfieldFormat(names: string[]): string {
  return names.map(n => `1 ${n}`).join("\n");
}
