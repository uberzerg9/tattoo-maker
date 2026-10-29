import type { Hit } from "../hit";
import { levelFromTone } from "../ink";
import type { CartridgePreset, PresetBundle } from "../presets";
import type { CartridgeId } from "../types";
import { mulberry32 } from "../util/prng";
import {
  BLOWOUT_HALO_SHARE,
  BLOWOUT_HALO_WIDTH,
  TRAUMA_RADIUS_SCALE,
  dotAmount,
  isBlowout,
  traumaAmount,
} from "./deposit";
import { needleLayout } from "./layout";
import type { NeedleDot } from "./layout";

/** Floats per dot: x, y (sheet mm), radius (mm), amount, ink level (0 black … 4 white; unused for trauma). */
export const DOT_FLOATS = 5;

export interface DotBatch {
  /** Interleaved dots; only the first `count * DOT_FLOATS` floats are valid, until the next plan(). */
  data: Float32Array;
  count: number;
}

export interface StampBatch {
  /** Needle dots and blowout halos, stamped into the ink buffer. */
  ink: DotBatch;
  /** Needle dots, added to the trauma buffer. */
  trauma: DotBatch;
}

/**
 * Expands hits into dots, ready to upload as instance data. Pure: the same hits always give the
 * same dots (jitter comes from each hit's seed), which is what undo and restore replay.
 */
export class StampPlanner {
  private readonly presets: PresetBundle;
  private readonly dotScale: number;
  private readonly layouts = new Map<CartridgeId, NeedleDot[]>();
  private inkScratch = new Float32Array(1024 * DOT_FLOATS);
  private traumaScratch = new Float32Array(1024 * DOT_FLOATS);

  /**
   * `dotScale` widens or narrows every needle dot (1 = one needle wide, as in ENGINE.md §4).
   * It exists for tuning sessions; the amount each dot deposits is not changed.
   */
  constructor(presets: PresetBundle, dotScale = 1) {
    this.presets = presets;
    this.dotScale = dotScale > 0 ? dotScale : 1;
  }

  plan(hits: readonly Hit[], start = 0, end = hits.length): StampBatch {
    let needed = 0;
    for (let i = start; i < end; i++) needed += this.presets.cartridges[hits[i]!.cartridgeId].needles + 1;
    if (needed * DOT_FLOATS > this.inkScratch.length) {
      const size = Math.max(needed, (this.inkScratch.length / DOT_FLOATS) * 2) * DOT_FLOATS;
      this.inkScratch = new Float32Array(size);
      this.traumaScratch = new Float32Array(size);
    }

    const ink = this.inkScratch;
    const trauma = this.traumaScratch;
    let i = 0;
    let t = 0;
    for (let h = start; h < end; h++) {
      const hit = hits[h]!;
      const preset = this.presets.cartridges[hit.cartridgeId];
      const layout = this.layoutFor(hit.cartridgeId, preset);
      const amount = dotAmount(hit, preset, this.presets.ink.fadeBelow);
      const hurt = traumaAmount(hit, preset);
      const rand = mulberry32(hit.seed);
      const cos = Math.cos(hit.angle);
      const sin = Math.sin(hit.angle);
      const radius = (preset.needleMm / 2) * this.dotScale;
      const level = levelFromTone(hit.inkTone);

      for (const needle of layout) {
        // Two draws per needle, always, so the sequence does not depend on the amounts.
        const x = hit.x + needle.u * cos - needle.v * sin + (rand() * 2 - 1) * preset.spreadMm;
        const y = hit.y + needle.u * sin + needle.v * cos + (rand() * 2 - 1) * preset.spreadMm;

        ink[i++] = x;
        ink[i++] = y;
        ink[i++] = radius;
        ink[i++] = amount * needle.weight;
        ink[i++] = level;

        // The needle hurts the skin whether or not it carries ink, in the same spot as its ink dot.
        trauma[t++] = x;
        trauma[t++] = y;
        trauma[t++] = radius * TRAUMA_RADIUS_SCALE;
        trauma[t++] = hurt;
        trauma[t++] = 0;
      }

      // Too deep: ink spreads under the skin around the line. A mistake signal, so it must show.
      if (amount > 0 && isBlowout(hit, this.presets.trauma.blowoutDepth)) {
        ink[i++] = hit.x;
        ink[i++] = hit.y;
        ink[i++] = (preset.footprintMm * BLOWOUT_HALO_WIDTH) / 2;
        ink[i++] = amount * BLOWOUT_HALO_SHARE;
        ink[i++] = level;
      }
    }
    return { ink: { data: ink, count: i / DOT_FLOATS }, trauma: { data: trauma, count: t / DOT_FLOATS } };
  }

  private layoutFor(id: CartridgeId, preset: CartridgePreset): NeedleDot[] {
    let layout = this.layouts.get(id);
    if (!layout) {
      layout = needleLayout(preset);
      this.layouts.set(id, layout);
    }
    return layout;
  }
}
