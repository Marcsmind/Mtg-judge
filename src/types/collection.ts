export interface CollectionGroup {
  id: string;
  name: string;
  createdAt: number;
}

export interface CollectionCard {
  id: string;
  groupId: string;
  scryfallId: string;
  name: string;
  quantity: number;
  foil: boolean;
  addedAt: number;
  // Cached from Scryfall so filters work offline with no API calls
  colors: string[];        // ["W","U","B","R","G"] — empty = colorless
  typeLine: string;        // "Artifact — Equipment"
  cmc: number;
  imageUri: string;        // small image url
  priceUsd: number | null; // per-card price
  rarity: string;          // common | uncommon | rare | mythic
  setCode: string;
}

export const COLOR_SYMBOLS = ["W", "U", "B", "R", "G"] as const;
export type ColorSymbol = typeof COLOR_SYMBOLS[number];

export const CARD_TYPES = [
  "Creature", "Instant", "Sorcery", "Enchantment",
  "Artifact", "Land", "Planeswalker", "Battle",
] as const;
export type CardType = typeof CARD_TYPES[number];
