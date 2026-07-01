import { useState, useCallback, useMemo, useEffect } from "react";
import { STORAGE_KEYS } from "../constants/storageKeys";
import type { CollectionGroup, CollectionCard, GroupType } from "../types/collection";
import { isSupabaseConfigured } from "../services/supabase";
import {
  pushGroups, pushCards, pullAll,
  deleteGroupFromCloud, deleteCardFromCloud,
} from "../services/collectionSync";

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
  return stored.map(g => g.type ? g : { ...g, type: 'custom' as GroupType });
}

export function useCollection(userId?: string | null) {
  const [groups, setGroups] = useState<CollectionGroup[]>(() =>
    seedOrMigrate(readJson<CollectionGroup[]>(STORAGE_KEYS.COLLECTION_GROUPS, []))
  );
  const [cards, setCards] = useState<CollectionCard[]>(() =>
    readJson<CollectionCard[]>(STORAGE_KEYS.COLLECTION_CARDS, [])
  );

  const canSync = Boolean(userId && isSupabaseConfigured);

  // ── Local persist ─────────────────────────────────────────────────────────

  const persistGroups = useCallback((next: CollectionGroup[]) => {
    setGroups(next);
    writeJson(STORAGE_KEYS.COLLECTION_GROUPS, next);
  }, []);

  const persistCards = useCallback((next: CollectionCard[]) => {
    setCards(next);
    writeJson(STORAGE_KEYS.COLLECTION_CARDS, next);
  }, []);

  // ── Pull on sign-in: merge remote into local, upload any local-only items ─

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;
    let cancelled = false;

    pullAll(userId).then(remote => {
      if (cancelled || !remote) return;

      setGroups(local => {
        const byId = new Map(local.map(g => [g.id, g]));
        remote.groups.forEach(g => byId.set(g.id, g));  // remote wins on same ID
        const merged = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
        writeJson(STORAGE_KEYS.COLLECTION_GROUPS, merged);
        const localOnly = local.filter(g => !remote.groups.some(r => r.id === g.id));
        if (localOnly.length) pushGroups(userId, localOnly).catch(() => {});
        return merged;
      });

      setCards(local => {
        const byId = new Map(local.map(c => [c.id, c]));
        remote.cards.forEach(c => byId.set(c.id, c));   // remote wins on same ID
        const merged = [...byId.values()].sort((a, b) => a.addedAt - b.addedAt);
        writeJson(STORAGE_KEYS.COLLECTION_CARDS, merged);
        const localOnly = local.filter(c => !remote.cards.some(r => r.id === c.id));
        if (localOnly.length) pushCards(userId, localOnly).catch(() => {});
        return merged;
      });
    });

    return () => { cancelled = true; };
  }, [userId]);

  // ── Group operations ──────────────────────────────────────────────────────

  const addGroup = useCallback((name: string, type: GroupType = 'custom'): CollectionGroup => {
    const group: CollectionGroup = { id: uuid(), name, type, createdAt: Date.now() };
    persistGroups([...groups, group]);
    if (canSync) pushGroups(userId!, [group]).catch(() => {});
    return group;
  }, [groups, persistGroups, canSync, userId]);

  const renameGroup = useCallback((id: string, name: string) => {
    const next = groups.map(g => g.id === id ? { ...g, name } : g);
    persistGroups(next);
    if (canSync) {
      const changed = next.find(g => g.id === id);
      if (changed) pushGroups(userId!, [changed]).catch(() => {});
    }
  }, [groups, persistGroups, canSync, userId]);

  const deleteGroup = useCallback((id: string) => {
    persistGroups(groups.filter(g => g.id !== id));
    persistCards(cards.filter(c => c.groupId !== id));
    if (canSync) deleteGroupFromCloud(userId!, id).catch(() => {});
  }, [groups, cards, persistGroups, persistCards, canSync, userId]);

  // ── Card operations ───────────────────────────────────────────────────────

  const addCard = useCallback((card: Omit<CollectionCard, "id" | "addedAt">) => {
    const existing = cards.find(
      c => c.scryfallId === card.scryfallId && c.groupId === card.groupId && c.foil === card.foil
    );
    let upserted: CollectionCard;
    if (existing) {
      upserted = { ...existing, quantity: existing.quantity + card.quantity };
      persistCards(cards.map(c => c.id === existing.id ? upserted : c));
    } else {
      upserted = { ...card, id: uuid(), addedAt: Date.now() };
      persistCards([...cards, upserted]);
    }
    if (canSync) pushCards(userId!, [upserted]).catch(() => {});
  }, [cards, persistCards, canSync, userId]);

  const updateCard = useCallback((id: string, patch: Partial<CollectionCard>) => {
    const next = cards.map(c => c.id === id ? { ...c, ...patch } : c);
    persistCards(next);
    if (canSync) {
      const changed = next.find(c => c.id === id);
      if (changed) pushCards(userId!, [changed]).catch(() => {});
    }
  }, [cards, persistCards, canSync, userId]);

  const removeCard = useCallback((id: string) => {
    persistCards(cards.filter(c => c.id !== id));
    if (canSync) deleteCardFromCloud(userId!, id).catch(() => {});
  }, [cards, persistCards, canSync, userId]);

  // ── Want-list IDs for scanner alerts ─────────────────────────────────────

  const wantedIds = useMemo(() => {
    const wantGroupIds = new Set(groups.filter(g => g.type === 'wants').map(g => g.id));
    return new Set(cards.filter(c => wantGroupIds.has(c.groupId)).map(c => c.scryfallId));
  }, [groups, cards]);

  return { groups, cards, wantedIds, addGroup, renameGroup, deleteGroup, addCard, updateCard, removeCard };
}
