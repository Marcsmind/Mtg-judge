import { useState, useCallback, useMemo } from "react";
import { STORAGE_KEYS } from "../constants/storageKeys";
import type { CollectionGroup, CollectionCard, GroupType } from "../types/collection";

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

const DEFAULT_GROUPS: CollectionGroup[] = [
  { id: uuid(), name: 'My Collection', type: 'collection', createdAt: Date.now() },
  { id: uuid(), name: 'Want List',     type: 'wants',      createdAt: Date.now() + 1 },
  { id: uuid(), name: 'Trade Pile',    type: 'trade',      createdAt: Date.now() + 2 },
];

function seedOrMigrate(stored: CollectionGroup[]): CollectionGroup[] {
  if (stored.length === 0) {
    writeJson(STORAGE_KEYS.COLLECTION_GROUPS, DEFAULT_GROUPS);
    return DEFAULT_GROUPS;
  }
  // Migrate groups created before GroupType was added
  return stored.map(g => g.type ? g : { ...g, type: 'custom' as GroupType });
}

export function useCollection() {
  const [groups, setGroups] = useState<CollectionGroup[]>(() =>
    seedOrMigrate(readJson<CollectionGroup[]>(STORAGE_KEYS.COLLECTION_GROUPS, []))
  );
  const [cards, setCards] = useState<CollectionCard[]>(() =>
    readJson<CollectionCard[]>(STORAGE_KEYS.COLLECTION_CARDS, [])
  );

  const persistGroups = useCallback((next: CollectionGroup[]) => {
    setGroups(next);
    writeJson(STORAGE_KEYS.COLLECTION_GROUPS, next);
  }, []);

  const persistCards = useCallback((next: CollectionCard[]) => {
    setCards(next);
    writeJson(STORAGE_KEYS.COLLECTION_CARDS, next);
  }, []);

  const addGroup = useCallback((name: string, type: GroupType = 'custom'): CollectionGroup => {
    const group: CollectionGroup = { id: uuid(), name, type, createdAt: Date.now() };
    persistGroups([...groups, group]);
    return group;
  }, [groups, persistGroups]);

  const renameGroup = useCallback((id: string, name: string) => {
    persistGroups(groups.map(g => g.id === id ? { ...g, name } : g));
  }, [groups, persistGroups]);

  const deleteGroup = useCallback((id: string) => {
    persistGroups(groups.filter(g => g.id !== id));
    persistCards(cards.filter(c => c.groupId !== id));
  }, [groups, cards, persistGroups, persistCards]);

  const addCard = useCallback((card: Omit<CollectionCard, "id" | "addedAt">) => {
    const existing = cards.find(
      c => c.scryfallId === card.scryfallId && c.groupId === card.groupId && c.foil === card.foil
    );
    if (existing) {
      persistCards(cards.map(c =>
        c.id === existing.id ? { ...c, quantity: c.quantity + card.quantity } : c
      ));
    } else {
      persistCards([...cards, { ...card, id: uuid(), addedAt: Date.now() }]);
    }
  }, [cards, persistCards]);

  const updateCard = useCallback((id: string, patch: Partial<CollectionCard>) => {
    persistCards(cards.map(c => c.id === id ? { ...c, ...patch } : c));
  }, [cards, persistCards]);

  const removeCard = useCallback((id: string) => {
    persistCards(cards.filter(c => c.id !== id));
  }, [cards, persistCards]);

  // Set of scryfallIds that are in any 'wants' group — used by scanner for alerts
  const wantedIds = useMemo(() => {
    const wantGroupIds = new Set(groups.filter(g => g.type === 'wants').map(g => g.id));
    return new Set(cards.filter(c => wantGroupIds.has(c.groupId)).map(c => c.scryfallId));
  }, [groups, cards]);

  return { groups, cards, wantedIds, addGroup, renameGroup, deleteGroup, addCard, updateCard, removeCard };
}
