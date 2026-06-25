#!/usr/bin/env node
/**
 * Generates the perceptual hash database for the card scanner.
 *
 * Run once per set release:
 *   npm run hash-db
 *
 * First run: downloads ~40k art_crop images from Scryfall (~2 hrs).
 * Subsequent runs are incremental — only new cards are downloaded.
 * Progress is cached in .card-hash-cache/ (gitignored).
 *
 * Output:
 *   public/card-db/hashes.bin   — packed binary (uint32 count, then hi[], lo[])
 *   public/card-db/meta.json    — [{id, n, s, c}, ...] parallel to hash array
 *
 * Requires: npm install --save-dev sharp
 */

import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'card-db');
const CACHE_DIR = join(ROOT, '.card-hash-cache');

const HASH_SIZE = 32;
const DCT_SIZE = 8;

// ── DCT-based pHash (must match src/services/pHash.ts exactly) ──────────────

function dct1d(values) {
  const N = values.length;
  const result = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += values[n] * Math.cos(Math.PI * k * (2 * n + 1) / (2 * N));
    }
    result[k] = sum * (k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N));
  }
  return result;
}

function computePHash(gray) {
  const N = HASH_SIZE;
  const tmp = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const row = gray.slice(y * N, (y + 1) * N);
    tmp.set(dct1d(row), y * N);
  }
  const dct = new Float32Array(N * N);
  for (let x = 0; x < N; x++) {
    const col = new Float32Array(N);
    for (let y = 0; y < N; y++) col[y] = tmp[y * N + x];
    const dctCol = dct1d(col);
    for (let y = 0; y < N; y++) dct[y * N + x] = dctCol[y];
  }
  let sum = 0, count = 0;
  for (let y = 0; y < DCT_SIZE; y++) {
    for (let x = 0; x < DCT_SIZE; x++) {
      if (x === 0 && y === 0) continue;
      sum += dct[y * N + x]; count++;
    }
  }
  const mean = sum / count;
  let hi = 0, lo = 0, bit = 0;
  for (let y = 0; y < DCT_SIZE; y++) {
    for (let x = 0; x < DCT_SIZE; x++) {
      if (x === 0 && y === 0) continue;
      const val = dct[y * N + x] >= mean ? 1 : 0;
      if (bit < 32) hi |= (val << bit); else lo |= (val << (bit - 32));
      bit++;
    }
  }
  return { hi: hi >>> 0, lo: lo >>> 0 };
}

async function hashImageBuffer(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(HASH_SIZE, HASH_SIZE, { kernel: 'lanczos3', fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const gray = new Float32Array(HASH_SIZE * HASH_SIZE);
  for (let i = 0; i < HASH_SIZE * HASH_SIZE; i++) {
    const j = i * ch;
    gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  return computePHash(gray);
}

// ── Rate limiter (Scryfall: max 10 req/sec) ───────────────────────────────────

function makeRateLimiter(maxPerSec) {
  let tokens = maxPerSec;
  let lastRefill = Date.now();
  return async () => {
    while (tokens <= 0) {
      const now = Date.now();
      tokens = Math.min(maxPerSec, tokens + ((now - lastRefill) / 1000) * maxPerSec);
      lastRefill = now;
      if (tokens <= 0) await new Promise(r => setTimeout(r, 100));
    }
    tokens--;
  };
}

const HEADERS = {
  'User-Agent': 'ArbiterApp/1.0 (card-hash-builder; contact@arbiterpal.com)',
  'Accept': 'application/json',
};

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  // 1. Resolve latest unique-artwork bulk URL
  console.log('Fetching Scryfall bulk data catalog…');
  const catalog = await (await fetchWithRetry('https://api.scryfall.com/bulk-data')).json();
  const bulk = catalog.data.find(b => b.type === 'unique_artwork');
  console.log(`Bulk data updated: ${bulk.updated_at} (${(bulk.size / 1024 / 1024).toFixed(1)} MB)`);

  // 2. Download card list
  console.log('Downloading card list…');
  const cards = await (await fetchWithRetry(bulk.download_uri)).json();
  console.log(`Cards to process: ${cards.length}`);

  const rl = makeRateLimiter(8);
  const hashHiArr = [], hashLoArr = [], metaArr = [];
  let processed = 0, fromCache = 0, errors = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const artUrl = card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop;
    if (!artUrl) continue;

    const cacheFile = join(CACHE_DIR, `${card.id}.json`);
    let hash;

    if (existsSync(cacheFile)) {
      hash = JSON.parse(readFileSync(cacheFile, 'utf8'));
      fromCache++;
    } else {
      try {
        await rl();
        const buf = Buffer.from(await (await fetchWithRetry(artUrl)).arrayBuffer());
        hash = await hashImageBuffer(buf);
        writeFileSync(cacheFile, JSON.stringify(hash));
        processed++;
      } catch (e) {
        console.error(`  ✗ ${card.name} (${card.id}): ${e.message}`);
        errors++;
        continue;
      }
    }

    hashHiArr.push(hash.hi);
    hashLoArr.push(hash.lo);
    metaArr.push({ id: card.id, n: card.name, s: card.set, c: card.collector_number });

    const total = processed + fromCache;
    if (total % 500 === 0) {
      const pct = ((i / cards.length) * 100).toFixed(1);
      console.log(`  ${pct}% — ${total} done (${processed} fetched, ${fromCache} cached, ${errors} errors)`);
    }
  }

  // 3. Write binary: [uint32 count][Uint32Array hi][Uint32Array lo]
  const count = hashHiArr.length;
  const ab = new ArrayBuffer(4 + count * 8);
  const dv = new DataView(ab);
  dv.setUint32(0, count, true);
  const hi = new Uint32Array(ab, 4, count);
  const lo = new Uint32Array(ab, 4 + count * 4, count);
  hashHiArr.forEach((v, i) => { hi[i] = v; });
  hashLoArr.forEach((v, i) => { lo[i] = v; });

  const binPath = join(OUT_DIR, 'hashes.bin');
  writeFileSync(binPath, Buffer.from(ab));
  const binKB = (ab.byteLength / 1024).toFixed(0);

  // 4. Write metadata JSON
  const metaPath = join(OUT_DIR, 'meta.json');
  writeFileSync(metaPath, JSON.stringify(metaArr));
  const metaKB = (Buffer.byteLength(JSON.stringify(metaArr)) / 1024).toFixed(0);

  console.log(`\n✓ Done! ${count} cards`);
  console.log(`  hashes.bin — ${binKB} KB`);
  console.log(`  meta.json  — ${metaKB} KB (+ Netlify gzip ~${Math.round(metaKB * 0.3)} KB on wire)`);
  console.log(`\nCommit public/card-db/ and redeploy to Netlify.`);
}

main().catch(e => { console.error(e); process.exit(1); });
