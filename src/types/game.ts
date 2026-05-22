/**
 * Shared game types — single source of truth.
 *
 * Imported by:
 *   - src/views/LifeCounter.tsx
 *   - src/views/life-counter/CommanderDamageModal.tsx
 *   - src/views/life-counter/GameSummaryModal.tsx
 *   - src/services/multiplayerSync.ts
 *
 * Keeping these here avoids circular imports and eliminates the three duplicate
 * Player interface definitions that previously lived in each file.
 */

export type TokenKey = "treasure" | "food" | "clue" | "blood";

export interface PlayerTokens {
  treasure: number;
  food: number;
  clue: number;
  blood: number;
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
  commanderName?: string;  // set from multiplayer lobby; used for card-art popup
}

// ── Multiplayer Lobby ──────────────────────────────────────────────────────────

/** Per-device identity during the pre-game lobby phase. */
export interface LobbyPlayer {
  deviceId: string;       // stable random UUID per device (from localStorage)
  playerName: string;     // editable in lobby; pre-filled from Settings display name
  colorName: "white" | "blue" | "black" | "red" | "green" | "purple";
  commanderName: string;  // optional — text field with Scryfall autocomplete
  isHost: boolean;
  isReady: boolean;
}

export type DayNightState = "none" | "day" | "night";

export interface ActiveCounters {
  monarch: boolean;
  poison: boolean;
  rad: boolean;
  dayNight: boolean;
  initiative: boolean;
  cityBlessing: boolean;
  tokens: boolean;
}
