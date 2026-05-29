/**
 * SavedDeck — a user-saved commander deck record.
 *
 * Stored in localStorage as a JSON array under STORAGE_KEYS.SAVED_DECKS.
 * winRate is computed on the fly (wins / gamesPlayed) — not persisted.
 */

export interface DeckCard {
  name: string;
  quantity: number;
  category: string;   // "Commander" | "Creatures" | "Instants" | etc.
  imageUrl?: string;  // Scryfall art-crop URL, captured when card is added
}

export interface SavedDeck {
  id: string;            // crypto.randomUUID()
  name: string;          // user-chosen label, e.g. "Atraxa Infect"
  commanderName: string; // primary commander (Scryfall canonical name)
  partnerName?: string;  // optional partner commander
  notes?: string;        // free-text notes
  cards?: DeckCard[];    // card-by-card list (populated by deck editor)
  createdAt: number;     // Date.now() at creation
  gamesPlayed: number;   // incremented by recordDeckResult
  wins: number;          // incremented by recordDeckResult when won === true
}
