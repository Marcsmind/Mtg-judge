import React, { createContext, useContext } from 'react';
import type { Player, ActiveCounters } from '../../types/game';
import type { SavedDeck } from '../../types/deck';

// ── Shared color theme (was duplicated in PlayerCard + TableView) ──────────────

export interface ColorTheme { bg: string; accent: string; border: string; }

// ── State shape ───────────────────────────────────────────────────────────────

export interface GameState {
  players:        Player[];
  activeCounters: ActiveCounters;
  colors:         Record<string, ColorTheme>;
  savedDecks:     SavedDeck[];
  playerCount:    number;
  layoutMode:     'table' | 'scorekeeper';
}

// ── Action callbacks ───────────────────────────────────────────────────────────

export type HubTab = "commander" | "damage" | "counters" | "mana";

export interface GameActions {
  adjustLife:              (id: number, delta: number) => void;
  adjustPoison:            (id: number, delta: number) => void;
  renamePlayer:            (id: number, name: string) => void;
  toggleCityBlessing:      (id: number) => void;
  togglePlayerTokensPanel: (id: number) => void;
  openCommanderHub:        (id: number, tab?: HubTab) => void;
  openPlayerSetup:         (id: number) => void;
  revivePlayer:            (id: number) => void;
  onSetCommander:          (id: number, name: string, deckId?: string) => void;
  onClearCommander:        (id: number) => void;
}

// ── Contexts ──────────────────────────────────────────────────────────────────

const GameStateCtx   = createContext<GameState   | null>(null);
const GameActionsCtx = createContext<GameActions | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function GameProvider({
  state,
  actions,
  children,
}: {
  state:    GameState;
  actions:  GameActions;
  children: React.ReactNode;
}) {
  return (
    <GameStateCtx.Provider value={state}>
      <GameActionsCtx.Provider value={actions}>
        {children}
      </GameActionsCtx.Provider>
    </GameStateCtx.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useGameState(): GameState {
  const ctx = useContext(GameStateCtx);
  if (!ctx) throw new Error('useGameState must be used within GameProvider');
  return ctx;
}

export function useGameActions(): GameActions {
  const ctx = useContext(GameActionsCtx);
  if (!ctx) throw new Error('useGameActions must be used within GameProvider');
  return ctx;
}
