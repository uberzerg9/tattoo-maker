import type { Hit } from "../hit";
import type { CartridgePreset } from "../presets";

/**
 * [tune] Depth below which a needle barely marks the skin, and where it reaches full strength.
 * ENGINE.md says "~0 below 0.15"; a floor of exactly 0.15 would deposit nothing at that depth,
 * so the curve starts a little lower and a shallow 0.15 still leaves a faint mark.
 */
const DEPTH_FLOOR = 0.05;
const DEPTH_FULL = 0.6;

/** How much ink and trauma a needle delivers at a given depth: ~0 when shallow, 1 from about 0.6 up. */
export function depthCurve(depth: number): number {
  const t = Math.min(1, Math.max(0, (depth - DEPTH_FLOOR) / (DEPTH_FULL - DEPTH_FLOOR)));
  return t * t * (3 - 2 * t);
}

/** [tune] A trauma dot is a little wider than the ink dot of the same needle. */
export const TRAUMA_RADIUS_SCALE = 1.6;
/** [tune] A blowout halo is about three times the cartridge footprint wide, at a tenth of the ink. */
export const BLOWOUT_HALO_WIDTH = 3;
export const BLOWOUT_HALO_SHARE = 0.1;

/** 1 while the cartridge holds at least `fadeBelow`, then falling linearly to 0 when it is dry. */
export function inkFactor(inkLevel: number, fadeBelow: number): number {
  if (fadeBelow <= 0) return inkLevel > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, inkLevel / fadeBelow));
}

/** Ink density one needle dot of this hit deposits at its centre, before the needle's own weight. */
export function dotAmount(hit: Pick<Hit, "depth" | "inkLevel">, preset: CartridgePreset, fadeBelow: number): number {
  return preset.inkPerHit * depthCurve(hit.depth) * inkFactor(hit.inkLevel, fadeBelow);
}

/** Trauma one needle dot adds at its centre. Needs no ink: a dry needle still hurts the skin. */
export function traumaAmount(hit: Pick<Hit, "depth">, preset: CartridgePreset): number {
  return preset.traumaPerHit * depthCurve(hit.depth);
}

/** Whether a hit is deep enough to blow out: ink spreading under the skin around the line. */
export function isBlowout(hit: Pick<Hit, "depth">, blowoutDepth: number): boolean {
  return hit.depth > blowoutDepth;
}
