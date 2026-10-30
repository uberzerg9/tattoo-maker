import type { Hit } from "./hit";
import type { PresetBundle } from "./presets";
import type { CartridgeId, InkCapId, SupplyState } from "./types";

/** Caps from darkest to lightest. The index is the ink's "level" in the ink buffer. */
export const CAP_ORDER = ["black", "g60", "g30", "g10", "white"] as const satisfies readonly InkCapId[];

/** [tune] 0 = black … 1 = white. How light each cap's ink is. */
export const INK_TONE: Record<InkCapId, number> = {
  black: 0,
  g60: 0.4,
  g30: 0.7,
  g10: 0.9,
  white: 1,
};

/** [tune] Share of a cap's ink one dip takes. */
export const CAP_COST_PER_DIP = 0.04;

/** Black ink as it sits in the skin: close to, but not exactly, black. */
export const BLACK_INK_RGB: readonly [number, number, number] = [0.078, 0.075, 0.086];
/** White ink as it sits in the skin. */
export const WHITE_INK_RGB: readonly [number, number, number] = [0.98, 0.98, 0.97];

/** How much of the skin's light the ink of a dark level lets through, per channel. */
export function inkTransmittance(level: number): [number, number, number] {
  const cap = CAP_ORDER[level] ?? "black";
  const t = INK_TONE[cap];
  return [
    BLACK_INK_RGB[0] + (1 - BLACK_INK_RGB[0]) * t,
    BLACK_INK_RGB[1] + (1 - BLACK_INK_RGB[1]) * t,
    BLACK_INK_RGB[2] + (1 - BLACK_INK_RGB[2]) * t,
  ];
}

/** Level index (0 = black … 4 = white) of the cap whose tone is closest. */
export function levelFromTone(tone: number): number {
  let best = 0;
  let bestDist = Infinity;
  CAP_ORDER.forEach((cap, i) => {
    const d = Math.abs(INK_TONE[cap] - tone);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

interface Needle {
  level: number;
  tone: number;
}

/**
 * What the needle carries and what is left in the caps.
 *
 * Each cartridge holds its own ink. A dip fills the current cartridge from a cap and takes a
 * little out of that cap; choosing another cap changes nothing until the next dip. Every hit
 * uses ink in proportion to the needles that struck.
 */
export class InkSupply {
  private readonly presets: PresetBundle;
  private readonly caps: Record<InkCapId, number>;
  private readonly needles = new Map<CartridgeId, Needle>();

  constructor(presets: PresetBundle) {
    this.presets = presets;
    this.caps = { black: 1, g60: 1, g30: 1, g10: 1, white: 1 };
  }

  /** Ink left in each cap, 0..1. */
  capLevels(): Record<InkCapId, number> {
    return { ...this.caps };
  }

  /** Ink in a cartridge, 0..1. A cartridge nobody dipped starts full of black. */
  level(cartridge: CartridgeId): number {
    return this.needle(cartridge).level;
  }

  tone(cartridge: CartridgeId): number {
    return this.needle(cartridge).tone;
  }

  canDip(cap: InkCapId): boolean {
    return this.caps[cap] > 0;
  }

  /** Fills the cartridge from a cap. Returns false, changing nothing, when the cap is empty. */
  dip(cartridge: CartridgeId, cap: InkCapId): boolean {
    if (!this.canDip(cap)) return false;
    this.caps[cap] = Math.max(0, this.caps[cap] - CAP_COST_PER_DIP);
    const n = this.needle(cartridge);
    n.level = 1;
    n.tone = INK_TONE[cap];
    return true;
  }

  /**
   * Gives each hit the ink the needle holds at that moment and uses some up. Call once per
   * hit, in order, before the hit is recorded.
   */
  apply(hits: readonly Hit[]): void {
    for (const hit of hits) {
      const n = this.needle(hit.cartridgeId);
      hit.inkLevel = n.level;
      hit.inkTone = n.tone;
      const used = this.presets.ink.consumptionPerHit * this.presets.cartridges[hit.cartridgeId].needles;
      n.level = Math.max(0, n.level - used);
    }
  }

  /** Everything undo has to give back: the caps and what each cartridge carries. */
  snapshot(): SupplyState {
    return {
      caps: { ...this.caps },
      needles: Object.fromEntries([...this.needles].map(([id, n]) => [id, { ...n }])),
    };
  }

  restore(state: SupplyState): void {
    Object.assign(this.caps, state.caps);
    this.needles.clear();
    for (const [id, n] of Object.entries(state.needles)) this.needles.set(id as CartridgeId, { ...n });
  }

  private needle(cartridge: CartridgeId): Needle {
    let n = this.needles.get(cartridge);
    if (!n) {
      n = { level: 1, tone: INK_TONE.black };
      this.needles.set(cartridge, n);
    }
    return n;
  }
}
