import { supabase } from './supabase';
import type { CollectionGroup, CollectionCard } from '../types/collection';
import type { GroupType } from '../types/collection';

// ── Row types matching the DB schema ─────────────────────────────────────────

interface GroupRow {
  id: string;
  user_id: string;
  name: string;
  type: string;
  created_at: number;
}

interface CardRow {
  id: string;
  user_id: string;
  group_id: string;
  scryfall_id: string;
  name: string;
  quantity: number;
  foil: boolean;
  added_at: number;
  colors: string[];
  type_line: string;
  cmc: number;
  image_uri: string;
  price_usd: number | null;
  rarity: string;
  set_code: string;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function groupToRow(userId: string, g: CollectionGroup): GroupRow {
  return { id: g.id, user_id: userId, name: g.name, type: g.type, created_at: g.createdAt };
}

function rowToGroup(r: GroupRow): CollectionGroup {
  return { id: r.id, name: r.name, type: r.type as GroupType, createdAt: r.created_at };
}

function cardToRow(userId: string, c: CollectionCard): CardRow {
  return {
    id: c.id, user_id: userId, group_id: c.groupId, scryfall_id: c.scryfallId,
    name: c.name, quantity: c.quantity, foil: c.foil, added_at: c.addedAt,
    colors: c.colors, type_line: c.typeLine, cmc: c.cmc,
    image_uri: c.imageUri, price_usd: c.priceUsd, rarity: c.rarity, set_code: c.setCode,
  };
}

function rowToCard(r: CardRow): CollectionCard {
  return {
    id: r.id, groupId: r.group_id, scryfallId: r.scryfall_id, name: r.name,
    quantity: r.quantity, foil: r.foil, addedAt: r.added_at,
    colors: r.colors ?? [], typeLine: r.type_line ?? '', cmc: r.cmc ?? 0,
    imageUri: r.image_uri ?? '', priceUsd: r.price_usd ?? null,
    rarity: r.rarity ?? 'common', setCode: r.set_code ?? '',
  };
}

// ── Push (upsert) ─────────────────────────────────────────────────────────────

export async function pushGroups(userId: string, groups: CollectionGroup[]): Promise<void> {
  if (!groups.length) return;
  await supabase.from('collection_groups').upsert(groups.map(g => groupToRow(userId, g)));
}

export async function pushCards(userId: string, cards: CollectionCard[]): Promise<void> {
  if (!cards.length) return;
  await supabase.from('collection_cards').upsert(cards.map(c => cardToRow(userId, c)));
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteGroupFromCloud(userId: string, groupId: string): Promise<void> {
  await Promise.all([
    supabase.from('collection_groups').delete().eq('id', groupId).eq('user_id', userId),
    supabase.from('collection_cards').delete().eq('group_id', groupId).eq('user_id', userId),
  ]);
}

export async function deleteCardFromCloud(userId: string, cardId: string): Promise<void> {
  await supabase.from('collection_cards').delete().eq('id', cardId).eq('user_id', userId);
}

// ── Pull ──────────────────────────────────────────────────────────────────────

export async function pullAll(
  userId: string,
): Promise<{ groups: CollectionGroup[]; cards: CollectionCard[] } | null> {
  const [gr, cr] = await Promise.all([
    supabase.from('collection_groups').select('*').eq('user_id', userId),
    supabase.from('collection_cards').select('*').eq('user_id', userId),
  ]);
  if (gr.error || cr.error) return null;
  return {
    groups: (gr.data ?? []).map(r => rowToGroup(r as GroupRow)),
    cards:  (cr.data ?? []).map(r => rowToCard(r as CardRow)),
  };
}
