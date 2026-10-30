import type { TraumaLevel } from "../types";

/** Texels of each buffer one cell of the reduction covers (2048 × 1536 → 64 × 48). */
export const REDUCE_BLOCK = 32;
export const REDUCE_CELLS = { width: 64, height: 48 } as const;
/** An area counts as inked above this density (ENGINE.md §8). */
export const INKED_DENSITY = 0.05;

/** [ENGINE.md §8] Below 5% of the inked area overworked is low, up to 15% medium, above high. */
export const MEDIUM_SHARE = 0.05;
export const HIGH_SHARE = 0.15;

export function traumaLevelFromShare(share: number): TraumaLevel {
  if (share > HIGH_SHARE) return "high";
  if (share >= MEDIUM_SHARE) return "medium";
  return "low";
}

export interface Reduction {
  /** Texels with ink above INKED_DENSITY. */
  inkedTexels: number;
  /** Of those, texels with trauma above the overwork threshold. */
  overworkedTexels: number;
}

/**
 * Sums the reduction's cells. The GPU writes, per cell, the number of inked texels in red and
 * the number of those that are overworked in green (RGBA, one float each).
 */
export function sumCells(cells: ArrayLike<number>): Reduction {
  let inkedTexels = 0;
  let overworkedTexels = 0;
  for (let i = 0; i + 1 < cells.length; i += 4) {
    inkedTexels += cells[i]!;
    overworkedTexels += cells[i + 1]!;
  }
  return { inkedTexels, overworkedTexels };
}

/** Share of the inked area that is overworked; 0 when nothing is inked. */
export function overworkShare(r: Reduction): number {
  return r.inkedTexels <= 0 ? 0 : r.overworkedTexels / r.inkedTexels;
}
