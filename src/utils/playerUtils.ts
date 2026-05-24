/**
 * Pure player-data utilities — no React, no side effects.
 * Exported here so they can be unit-tested without importing the full
 * LifeCounter component tree.
 */

import type { Player } from "../types/game";

/**
 * Safely reconstructs a Player from raw localStorage JSON.
 * All new fields are defaulted so old saved games always deserialise cleanly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseSavedPlayer(raw: any, fallbackLife: number): Player {
  return {
    id:              raw.id,
    name:            raw.name ?? `Player ${raw.id}`,
    avatar:          raw.avatar ?? "",
    life:            typeof raw.life === "number" ? raw.life : fallbackLife,
    tax:             raw.tax ?? 0,
    taxPartner:      raw.taxPartner ?? 0,
    partnerMode:     raw.partnerMode ?? false,
    colorName:       raw.colorName ?? "purple",
    commanderDamage: raw.commanderDamage ?? {},
    isMonarch:       raw.isMonarch ?? false,
    hasInitiative:   raw.hasInitiative ?? false,
    cityBlessing:    raw.cityBlessing ?? false,
    poison:          typeof raw.poison === "number" ? raw.poison : 0,
    rad:             typeof raw.rad    === "number" ? raw.rad    : 0,
    tokens: {
      treasure: raw.tokens?.treasure ?? 0,
      food:     raw.tokens?.food     ?? 0,
      clue:     raw.tokens?.clue     ?? 0,
      blood:    raw.tokens?.blood    ?? 0,
      rad:      raw.tokens?.rad      ?? 0,
    },
    enabledTokens:  Array.isArray(raw.enabledTokens) ? raw.enabledTokens : [],
    tokensOpen:     raw.tokensOpen ?? false,
    commanderName:  raw.commanderName ?? undefined,
    deckId:         raw.deckId        ?? undefined,
  };
}
