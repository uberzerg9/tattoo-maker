import type { CartridgeId } from "./types";

/** One needle strike. Everything visible on the skin comes from a list of these. */
export interface Hit {
  /** Sheet mm. */
  x: number;
  y: number;
  /** ms since the stroke started. */
  t: number;
  /** Hand speed at this point, mm/s. */
  speed: number;
  /** 0..1. */
  depth: number;
  /** Direction of travel in radians (sheet space, y down); used by magnums. */
  angle: number;
  cartridgeId: CartridgeId;
  /** 0 = black … 1 = white, from the cap. */
  inkTone: number;
  /** Cartridge ink at the moment of the hit, 0..1. */
  inkLevel: number;
  /** Seeds all per-hit randomness (needle jitter, scatter). */
  seed: number;
}

/** [tune] Shapes pen pressure into depth. Below 1 lifts light pressure a little. */
const PRESSURE_EXPONENT = 0.8;
/** Mouse and trackpad report no real pressure, so they get a fixed depth. */
export const FIXED_DEPTH = 0.5;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function pressureToDepth(pressure: number): number {
  return clamp01(pressure) ** PRESSURE_EXPONENT;
}

/** Depth for a pointer sample: pen pressure through a curve; everything else a fixed 0.5. */
export function depthFromPointer(
  pointerType: string,
  pressure: number,
): number {
  return pointerType === "pen" && pressure > 0
    ? pressureToDepth(pressure)
    : FIXED_DEPTH;
}
