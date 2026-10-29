import { BLACK_INK_RGB, WHITE_INK_RGB, inkTransmittance } from "./ink";

/*
 * CPU reference for how ink accumulates in the ink buffer; the GPU stamp and composite
 * passes do the same arithmetic. It is what the unit tests specify.
 *
 * Why not plain premultiplied "over" blending of a tone colour: painting grey over a
 * saturated black would drag it towards grey a little with every dot, and many dots of grey
 * end up replacing the black. Real ink does not do that, so ink is kept as cumulative
 * densities instead:
 *
 *   c[m] = density of ink at least as dark as level m    (0 black, 1 grey 60, 2 grey 30,
 *                                                         3 grey 10, 4 white = everything)
 *
 * A stamp of level j with amount a applies the usual saturating blend
 * c' = c + a * (1 - c) to every channel m >= j and leaves the darker channels alone. So darker
 * ink over lighter ink darkens it, lighter ink over darker ink only fills spare capacity, and
 * no channel ever exceeds 1.
 */

export const LEVELS = 5;
export type Densities = number[];

export const emptyDensities = (): Densities => new Array<number>(LEVELS).fill(0);

/** One needle dot of ink at `level` landing on a texel. */
export function stampInk(c: Densities, level: number, amount: number): void {
  for (let m = Math.max(0, level); m < LEVELS; m++) c[m] = c[m]! + amount * (1 - c[m]!);
}

/** Density of ink at exactly each level (differences of the cumulative channels). */
export function exactDensities(c: Densities): number[] {
  let prev = 0;
  return c.map((v) => {
    const clamped = Math.min(1, Math.max(0, v));
    const e = Math.max(0, clamped - prev);
    prev = Math.max(prev, clamped);
    return e;
  });
}

/** Colour of skin with this ink in it. */
export function inkedColor(skin: readonly [number, number, number], c: Densities): [number, number, number] {
  const e = exactDensities(c);
  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let darkness = 0;
    for (let level = 0; level < 4; level++) darkness += e[level]! * (1 - inkTransmittance(level)[ch]!);
    const base = skin[ch]! * (1 - darkness);
    out[ch] = base + (WHITE_INK_RGB[ch]! - base) * e[4]!;
  }
  return out;
}

export const blackFloor = (skin: readonly [number, number, number]): [number, number, number] => [
  skin[0] * BLACK_INK_RGB[0],
  skin[1] * BLACK_INK_RGB[1],
  skin[2] * BLACK_INK_RGB[2],
];
