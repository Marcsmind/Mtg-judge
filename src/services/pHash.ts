/**
 * DCT-based perceptual hash (pHash).
 * Algorithm must stay in sync with scripts/build-card-hashes.mjs.
 *
 * Hash is two uint32s (hi + lo) so we avoid BigInt in the hot lookup loop.
 */

const HASH_SIZE = 32;
const DCT_SIZE = 8;

export interface PHash { hi: number; lo: number; }

function dct1d(values: Float32Array): Float32Array {
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

export function computePHash(gray: Float32Array): PHash {
  const N = HASH_SIZE;

  const tmp = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    tmp.set(dct1d(gray.slice(y * N, (y + 1) * N)), y * N);
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

// Brian Kernighan's popcount for 32-bit int — fast in JS JIT
function popcount32(n: number): number {
  n = n | 0;
  n -= ((n >> 1) & 0x55555555);
  n  = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function hammingDistance(a: PHash, b: PHash): number {
  return popcount32(a.hi ^ b.hi) + popcount32(a.lo ^ b.lo);
}

// Reuse a single hidden canvas to avoid GC pressure in the scan loop
let _canvas: HTMLCanvasElement | null = null;
function getScratchCanvas(): HTMLCanvasElement {
  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _canvas.width = HASH_SIZE;
    _canvas.height = HASH_SIZE;
  }
  return _canvas;
}

/**
 * Extracts a region from a live video frame, resizes to 32×32, and computes pHash.
 * Coordinates are in VIDEO pixel space (video.videoWidth × video.videoHeight).
 */
export function hashVideoFrame(
  video: HTMLVideoElement,
  srcX: number, srcY: number, srcW: number, srcH: number,
): PHash | null {
  if (video.readyState < 2) return null;
  const canvas = getScratchCanvas();
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, HASH_SIZE, HASH_SIZE);
  const { data } = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE);

  const gray = new Float32Array(HASH_SIZE * HASH_SIZE);
  for (let i = 0; i < HASH_SIZE * HASH_SIZE; i++) {
    const j = i * 4;
    gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  return computePHash(gray);
}
