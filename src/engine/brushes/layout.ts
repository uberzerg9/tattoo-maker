import type { CartridgePreset } from "../presets";

/**
 * One needle in a cartridge's footprint, in the hit's local frame: u runs along the
 * direction of travel, v across it (v = u turned 90° clockwise on screen).
 */
export interface NeedleDot {
  u: number;
  v: number;
  /** Share of the hit's ink this needle deposits. Edge needles of a curved row carry less. */
  weight: number;
}

/** [tune] How far a curved row bows, as a share of its width. */
export const ARC_SAGITTA_RATIO = 0.12;
/** [tune] Ink an edge needle of a curved row deposits relative to the centre ones. */
export const EDGE_WEIGHT = 0.5;

/** Needle points arranged for one cartridge, centred on the hit position. */
export function needleLayout(
  preset: Pick<CartridgePreset, "layout" | "needles" | "needleMm" | "footprintMm">,
): NeedleDot[] {
  const { layout, needles: n, needleMm, footprintMm } = preset;
  // Distance from the footprint centre to the centre of an outermost needle.
  const reach = Math.max(0, (footprintMm - needleMm) / 2);
  if (n === 1) return [{ u: 0, v: 0, weight: 1 }];

  switch (layout) {
    case "round-tight":
    case "round-loose": {
      // A centre needle plus a ring; with three or fewer needles they all sit on the ring.
      const ring = n <= 3 ? n : n - 1;
      const dots: NeedleDot[] = n <= 3 ? [] : [{ u: 0, v: 0, weight: 1 }];
      for (let i = 0; i < ring; i++) {
        const a = -Math.PI / 2 + (i / ring) * Math.PI * 2;
        dots.push({ u: Math.cos(a) * reach, v: Math.sin(a) * reach, weight: 1 });
      }
      return dots;
    }
    case "flat-row":
    case "curved-row": {
      const curved = layout === "curved-row";
      const sagitta = curved ? footprintMm * ARC_SAGITTA_RATIO : 0;
      const dots: NeedleDot[] = [];
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1)) * 2 - 1; // -1 … 1 across the row
        dots.push({
          // The middle of the arc leads; shifted so the row's mean sits on the hit position.
          u: curved ? sagitta * (1 - t * t) - (sagitta * 2) / 3 : 0,
          v: t * reach,
          weight: curved ? 1 - (1 - EDGE_WEIGHT) * t * t : 1,
        });
      }
      return dots;
    }
  }
}
