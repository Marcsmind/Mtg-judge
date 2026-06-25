import { hammingDistance } from './pHash';
import type { PHash } from './pHash';

export interface CardMeta {
  id: string;  // Scryfall UUID
  n:  string;  // name
  s:  string;  // set code
  c:  string;  // collector number
}

interface DBState {
  hashHi: Uint32Array;
  hashLo: Uint32Array;
  meta:   CardMeta[];
}

const DB_BASE     = '/card-db';
const IDB_NAME    = 'arbiter-card-db';
const IDB_STORE   = 'blobs';
const MAX_HAMMING = 14;   // tune up/down based on real-world testing
const REFRESH_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days

let db: DBState | null = null;
let pending: Promise<DBState> | null = null;

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

function idbGet<T>(idb: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror  = () => reject(req.error);
  });
}

function idbPutAll(idb: IDBDatabase, entries: [string, unknown][]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    entries.forEach(([k, v]) => store.put(v, k));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── Load from network + persist to IDB ───────────────────────────────────────

async function fetchAndCache(): Promise<DBState> {
  const [binRes, metaRes] = await Promise.all([
    fetch(`${DB_BASE}/hashes.bin`),
    fetch(`${DB_BASE}/meta.json`),
  ]);
  if (!binRes.ok)  throw new Error(`hashes.bin: HTTP ${binRes.status}`);
  if (!metaRes.ok) throw new Error(`meta.json: HTTP ${metaRes.status}`);

  const [bin, meta]: [ArrayBuffer, CardMeta[]] = await Promise.all([
    binRes.arrayBuffer(),
    metaRes.json(),
  ]);

  const idb = await openIDB();
  await idbPutAll(idb, [
    ['hashes_bin', bin],
    ['meta',       meta],
    ['cached_at',  Date.now()],
  ]);

  return parseBuffer(bin, meta);
}

function parseBuffer(bin: ArrayBuffer, meta: CardMeta[]): DBState {
  const count  = new DataView(bin).getUint32(0, true);
  const hashHi = new Uint32Array(bin, 4, count);
  const hashLo = new Uint32Array(bin, 4 + count * 4, count);
  return { hashHi, hashLo, meta };
}

async function loadFromIDB(): Promise<DBState | null> {
  try {
    const idb = await openIDB();
    const [bin, meta, cachedAt] = await Promise.all([
      idbGet<ArrayBuffer>(idb, 'hashes_bin'),
      idbGet<CardMeta[]> (idb, 'meta'),
      idbGet<number>     (idb, 'cached_at'),
    ]);
    if (!bin || !meta || !cachedAt) return null;
    if (Date.now() - cachedAt > REFRESH_MS) return null; // stale
    return parseBuffer(bin, meta);
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadCardDB(onProgress?: (pct: number) => void): Promise<void> {
  if (db) return;
  if (pending) { await pending; return; }

  onProgress?.(5);
  pending = (async () => {
    const cached = await loadFromIDB();
    if (cached) { onProgress?.(100); return cached; }
    onProgress?.(20);
    const fresh = await fetchAndCache();
    onProgress?.(100);
    return fresh;
  })();

  db = await pending;
}

export function isDBLoaded(): boolean { return db !== null; }

export function findCard(hash: PHash): CardMeta | null {
  if (!db) return null;
  const { hashHi, hashLo, meta } = db;
  let bestIdx = -1, bestDist = MAX_HAMMING + 1;
  for (let i = 0; i < hashHi.length; i++) {
    const d = hammingDistance(hash, { hi: hashHi[i], lo: hashLo[i] });
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx >= 0 ? meta[bestIdx] : null;
}
