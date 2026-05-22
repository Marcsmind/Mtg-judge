/**
 * Pure deck-analysis utilities — no React, no side effects.
 * Exported here so they can be unit-tested without importing the full
 * DeckBuilder component tree.
 */

import type { ScryfallCard } from "../services/scryfall";

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
