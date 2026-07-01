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
    mana: {
      W: raw.mana?.W ?? 0, U: raw.mana?.U ?? 0, B: raw.mana?.B ?? 0,
      R: raw.mana?.R ?? 0, G: raw.mana?.G ?? 0, C: raw.mana?.C ?? 0,
    },
    storm:      typeof raw.storm      === "number" ? raw.storm      : 0,
    energy:     typeof raw.energy     === "number" ? raw.energy     : 0,
    experience: typeof raw.experience === "number" ? raw.experience : 0,
    generic:    typeof raw.generic    === "number" ? raw.generic    : 0,
    ringLevel:  typeof raw.ringLevel  === "number" ? raw.ringLevel  : 0,
    commanderName:        raw.commanderName        ?? undefined,
    partnerCommanderName: raw.partnerCommanderName ?? undefined,
    deckId:               raw.deckId               ?? undefined,
    artOffsetX:   typeof raw.artOffsetX === "number" ? raw.artOffsetX : undefined,
    artOffsetY:   typeof raw.artOffsetY === "number" ? raw.artOffsetY : undefined,
    artZoom:      typeof raw.artZoom    === "number" ? raw.artZoom    : undefined,
    artUsePartner: raw.artUsePartner === true ? true : undefined,
  };
}
