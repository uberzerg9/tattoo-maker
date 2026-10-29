/** Deterministic 32-bit seed for a hit, keyed by (strokeId, hitIndex). */
export function hashSeed(strokeId: number, hitIndex: number): number {
  let h =
    Math.imul(strokeId | 0, 0x9e3779b1) ^
    Math.imul((hitIndex | 0) + 0x7f4a7c15, 0x85ebca6b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
