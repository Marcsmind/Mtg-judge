import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ScryfallCard } from "../services/scryfall";
import { STORAGE_KEYS } from "../constants/storageKeys";

interface AppStore {
  // Shared player names — replaces App.tsx activeTab-triggered localStorage hack
  playerNames: string[];
  setPlayerNames: (names: string[]) => void;

  // Card history — shared between CardCodex and AIJudge
  cardHistory: ScryfallCard[];
  addToCardHistory: (card: ScryfallCard) => void;
  clearCardHistory: () => void;

  // Ephemeral cross-component signal: CardCodex History "Tag in Judge" → AIJudge
  // NOT persisted — one-shot signal that clears after AIJudge consumes it
  pendingTagCard: ScryfallCard | null;
  setPendingTagCard: (card: ScryfallCard | null) => void;

  // Ephemeral cross-component signal: CardCodex "Add to Collection" → Collection view
  // NOT persisted — one-shot signal that clears after Collection consumes it
  pendingAddToCollectionCard: ScryfallCard | null;
  setPendingAddToCollectionCard: (card: ScryfallCard | null) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      playerNames: [],
      setPlayerNames: (names) => set({ playerNames: names }),

      cardHistory: [],
      addToCardHistory: (card) => {
        const existing = get().cardHistory;
        // Deduplicate by card ID — never add the same card twice
        if (existing.some((c) => c.id === card.id)) return;
        // Cap history at 100 entries; newest cards first
        set({ cardHistory: [card, ...existing].slice(0, 100) });
      },
      clearCardHistory: () => set({ cardHistory: [] }),

      // pendingTagCard is intentionally NOT in partialize so it is never persisted
      pendingTagCard: null,
      setPendingTagCard: (card) => set({ pendingTagCard: card }),

      // pendingAddToCollectionCard is intentionally NOT in partialize so it is never persisted
      pendingAddToCollectionCard: null,
      setPendingAddToCollectionCard: (card) => set({ pendingAddToCollectionCard: card }),
    }),
    {
      name: STORAGE_KEYS.CARD_HISTORY,
      // Only persist durable state — pendingTagCard is ephemeral and must NOT be saved
      partialize: (state) => ({
        playerNames: state.playerNames,
        cardHistory: state.cardHistory,
      }),
    }
  )
);
