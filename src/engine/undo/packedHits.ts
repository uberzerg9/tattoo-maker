import type { Hit } from "../hit";
import type { CartridgeId } from "../types";

/** Cartridge ids by index; the packed form stores the index. */
export const CARTRIDGE_ORDER = ["rl-3", "rl-7", "rs-9", "m1-7", "rm-15"] as const satisfies readonly CartridgeId[];

/** 32-bit words per hit: x, y, t, speed, depth, angle, cartridge, inkTone, inkLevel, seed. */
const WORDS = 10;
export const BYTES_PER_HIT = WORDS * 4;

/**
 * A stroke's hits as one typed array, 40 bytes each. Every field is a float32 except the
 * cartridge index and the seed, which are stored as uint32 bits in the same buffer.
 */
export interface PackedHits {
  readonly count: number;
  readonly buffer: ArrayBuffer;
}

/**
 * Rounds every number of a hit to float32, in place. Hits are normalised when they are
 * recorded, before they are stamped, so replaying a packed copy stamps exactly what the
 * first stamping did.
 */
export function normalizeHit(hit: Hit): Hit {
  hit.x = Math.fround(hit.x);
  hit.y = Math.fround(hit.y);
  hit.t = Math.fround(hit.t);
  hit.speed = Math.fround(hit.speed);
  hit.depth = Math.fround(hit.depth);
  hit.angle = Math.fround(hit.angle);
  hit.inkTone = Math.fround(hit.inkTone);
  hit.inkLevel = Math.fround(hit.inkLevel);
  hit.seed = hit.seed >>> 0;
  return hit;
}

export function packHits(hits: readonly Hit[]): PackedHits {
  const buffer = new ArrayBuffer(hits.length * BYTES_PER_HIT);
  const f = new Float32Array(buffer);
  const u = new Uint32Array(buffer);
  hits.forEach((hit, i) => {
    const o = i * WORDS;
    f[o] = hit.x;
    f[o + 1] = hit.y;
    f[o + 2] = hit.t;
    f[o + 3] = hit.speed;
    f[o + 4] = hit.depth;
    f[o + 5] = hit.angle;
    u[o + 6] = Math.max(0, CARTRIDGE_ORDER.indexOf(hit.cartridgeId));
    f[o + 7] = hit.inkTone;
    f[o + 8] = hit.inkLevel;
    u[o + 9] = hit.seed >>> 0;
  });
  return { count: hits.length, buffer };
}

export function unpackHits(packed: PackedHits): Hit[] {
  const f = new Float32Array(packed.buffer);
  const u = new Uint32Array(packed.buffer);
  const hits: Hit[] = [];
  for (let i = 0; i < packed.count; i++) {
    const o = i * WORDS;
    hits.push({
      x: f[o]!,
      y: f[o + 1]!,
      t: f[o + 2]!,
      speed: f[o + 3]!,
      depth: f[o + 4]!,
      angle: f[o + 5]!,
      cartridgeId: CARTRIDGE_ORDER[u[o + 6]!] ?? CARTRIDGE_ORDER[0],
      inkTone: f[o + 7]!,
      inkLevel: f[o + 8]!,
      seed: u[o + 9]!,
    });
  }
  return hits;
}
