/**
 * Shared game types — single source of truth.
 *
 * Imported by:
 *   - src/views/LifeCounter.tsx
 *   - src/views/life-counter/CommanderHubModal.tsx
 *   - src/views/life-counter/GameSummaryModal.tsx
 *   - src/services/multiplayerSync.ts
 *
 * Keeping these here avoids circular imports and eliminates the three duplicate
 * Player interface definitions that previously lived in each file.
 */

export type TokenKey = "treasure" | "food" | "clue" | "blood" | "rad";

export interface PlayerMana {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number;
}

export type ManaKey = keyof PlayerMana;

export interface PlayerTokens {
  treasure: number;
  food: number;
  clue: number;
  blood: number;
  rad: number;
}

export interface Player {
  id: number;
  name: string;
  avatar: string;    // Single emoji avatar, e.g. "🐉". Empty string = no avatar.
  life: number;
  tax: number;
  taxPartner: number;
  partnerMode: boolean;
  colorName: "white" | "blue" | "black" | "red" | "green" | "purple";
  commanderDamage: Record<string, number>;
  isMonarch: boolean;
  hasInitiative: boolean;
  cityBlessing: boolean;
  poison: number;
  rad: number;
  tokens: PlayerTokens;
  enabledTokens: TokenKey[];
  tokensOpen: boolean;
  // Mana pool (tracked in ManaModal, not shown on card)
  mana: PlayerMana;
  storm: number;
  // Numeric counters (tracked in CountersModal, not shown on card)
  energy: number;
  experience: number;
  generic: number;
  ringLevel: number;  // 0 = not tempted, 1–4 = ring stages
  commanderName?: string;        // set from multiplayer lobby or in-game wand button
  partnerCommanderName?: string; // secondary commander for partner pairs
  deckId?: string;               // links to a SavedDeck for per-deck win tracking (local only)
  artOffsetX?: number;     // 0–100, background-position X; default 50
  artOffsetY?: number;     // 0–100, background-position Y; default 35 (faces tend to be upper)
  artZoom?: number;        // percentage of element width; undefined = CSS 'cover'
  artUsePartner?: boolean; // if true, background art comes from partnerCommanderName
}

// ── Multiplayer Lobby ──────────────────────────────────────────────────────────

/** Per-device identity during the pre-game lobby phase. */
export interface LobbyPlayer {
  deviceId: string;       // stable random UUID per device (from localStorage)
  playerName: string;     // editable in lobby; pre-filled from Settings display name
  colorName: "white" | "blue" | "black" | "red" | "green" | "purple";
  commanderName: string;  // optional — text field with Scryfall autocomplete
  deckId?: string;        // links to a SavedDeck; passed through to Player on game start
  isHost: boolean;
  isReady: boolean;
}

export type DayNightState = "none" | "day" | "night";

export interface ActiveCounters {
  monarch: boolean;
  poison: boolean;
  dayNight: boolean;
  initiative: boolean;
  cityBlessing: boolean;
  tokens: boolean;
}
