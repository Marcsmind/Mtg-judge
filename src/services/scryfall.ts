// Scryfall API Integration Service
// Card data is cached in localStorage for 7 days to reduce network requests
// and allow offline lookup of previously searched cards.

export interface ScryfallCard {
  id: string;
  name: string;
  oracle_text?: string;
  mana_cost?: string;
  type_line?: string;
  cmc?: number;        // Converted mana cost — used for mana-curve chart
  colors?: string[];
  color_identity?: string[];
  image_uris?: {
    normal?: string;
    art_crop?: string;
    small?: string;
  };
  card_faces?: Array<{
    name: string;
    oracle_text?: string;
    mana_cost?: string;
    type_line?: string;
    image_uris?: {
      normal?: string;
      art_crop?: string;
      small?: string;
    };
  }>;
  prices?: {
    usd?: string;
    usd_foil?: string;
    eur?: string;
    eur_foil?: string;
  };
  rulings_uri: string;
  scryfall_uri: string;
}

export interface ScryfallRuling {
  published_at: string;
  comment: string;
  source: string;
}

// ── Card + rulings cache helpers ──────────────────────────────────────────────

const CACHE_PREFIX         = "nexus_sf_";
const RULINGS_CACHE_PREFIX = "nexus_sf_rulings_";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CardCache    { card: ScryfallCard;        ts: number; }
interface RulingsCache { rulings: ScryfallRuling[]; ts: number; }

function getCachedCard(name: string): ScryfallCard | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + name.toLowerCase().trim());
    if (!raw) return null;
    const c: CardCache = JSON.parse(raw);
    if (Date.now() - c.ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + name.toLowerCase().trim());
      return null;
    }
    return c.card;
  } catch { return null; }
}

function setCachedCard(card: ScryfallCard) {
  try {
    const key = CACHE_PREFIX + card.name.toLowerCase().trim();
    localStorage.setItem(key, JSON.stringify({ card, ts: Date.now() } satisfies CardCache));
  } catch { /* localStorage full — silently skip */ }
}

function getCachedRulings(cardId: string): ScryfallRuling[] | null {
  try {
    const raw = localStorage.getItem(RULINGS_CACHE_PREFIX + cardId);
    if (!raw) return null;
    const c: RulingsCache = JSON.parse(raw);
    if (Date.now() - c.ts > CACHE_TTL) {
      localStorage.removeItem(RULINGS_CACHE_PREFIX + cardId);
      return null;
    }
    return c.rulings;
  } catch { return null; }
}

function setCachedRulings(cardId: string, rulings: ScryfallRuling[]) {
  try {
    localStorage.setItem(RULINGS_CACHE_PREFIX + cardId, JSON.stringify({ rulings, ts: Date.now() } satisfies RulingsCache));
  } catch { /* localStorage full — silently skip */ }
}

// ── Search autocomplete (fast suggestion list) ────────────────────────────────
export async function autocompleteCard(query: string, signal?: AbortSignal): Promise<string[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`,
      { signal }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch (err) {
    // AbortError is expected when a newer keystroke cancels an in-flight request
    if (err instanceof DOMException && err.name === "AbortError") return [];
    console.error("Scryfall autocomplete failed:", err);
    return [];
  }
}

// ── Search with Images (used for Bottom Sheet search preview) ────────────────
export async function searchCardsWithImages(query: string, signal?: AbortSignal): Promise<ScryfallCard[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    // 1. Get exact prefix matches from autocomplete (fast & accurate)
    const names = await autocompleteCard(query, signal);
    if (!names || names.length === 0) return [];

    // 2. Take top 10 results and fetch their full card data in one query
    const topNames = names.slice(0, 10);
    const exactQuery = topNames.map(n => `!"${n}"`).join(" or ");
    
    const res = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(exactQuery)}`,
      { signal }
    );
    if (!res.ok) return [];
    
    const data = await res.json();
    const cards: ScryfallCard[] = data.data || [];

    // 3. Sort cards to match the original autocomplete order
    return cards.sort((a, b) => {
      return topNames.indexOf(a.name) - topNames.indexOf(b.name);
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return [];
    console.error("Scryfall search with images failed:", err);
    return [];
  }
}

// Fuzzy search (fetches exact card details, accommodating slight typos)
// Results are cached locally for 7 days — repeated lookups are instant + work offline.
export async function searchCardFuzzy(query: string): Promise<ScryfallCard | null> {
  if (!query || query.trim().length === 0) return null;

  // 1. Check local cache first
  const cached = getCachedCard(query.trim());
  if (cached) return cached;

  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    const data = await res.json() as ScryfallCard;
    setCachedCard(data);
    return data;
  } catch (err) {
    console.error("Scryfall fuzzy search failed:", err);
    return null;
  }
}

// Fetches a card by its Scryfall UUID — used to enrich scanned cards with colors/type
export async function fetchCardById(id: string): Promise<ScryfallCard | null> {
  if (!id) return null;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const card = await res.json() as ScryfallCard;
    setCachedCard(card);
    return card;
  } catch {
    return null;
  }
}

// Fetches official WotC rulings for a card — results cached 7 days in localStorage
export async function fetchCardRulings(cardId: string): Promise<ScryfallRuling[]> {
  if (!cardId) return [];

  // Return cached rulings immediately — no network call needed
  const cached = getCachedRulings(cardId);
  if (cached) return cached;

  try {
    const res = await fetch(`https://api.scryfall.com/cards/${cardId}/rulings`);
    if (!res.ok) return [];
    const data = await res.json();
    const rulings: ScryfallRuling[] = data.data || [];
    setCachedRulings(cardId, rulings);
    return rulings;
  } catch (err) {
    console.error("Scryfall rulings fetch failed:", err);
    return [];
  }
}

// Helper to consolidate oracle text for single-sided or double-sided cards
export function getCardOracleText(card: ScryfallCard): string {
  if (card.oracle_text) {
    return card.oracle_text;
  }
  if (card.card_faces) {
    return card.card_faces
      .map(face => `[Face: ${face.name}] (${face.type_line || ""}) - Cost: ${face.mana_cost || "N/A"}\nText:\n${face.oracle_text || "None"}`)
      .join("\n\n");
  }
  return "No oracle text available.";
}

// Helper to resolve card image
export function getCardImage(card: ScryfallCard): string {
  if (card.image_uris?.normal) {
    return card.image_uris.normal;
  }
  if (card.card_faces && card.card_faces[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal;
  }
  return "/card-back.svg";
}
