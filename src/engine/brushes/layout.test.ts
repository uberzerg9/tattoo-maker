import { describe, expect, it } from "vitest";
import { bundledPresets } from "../presets";
import { EDGE_WEIGHT, needleLayout } from "./layout";

const layoutOf = (id: keyof typeof bundledPresets.cartridges) => needleLayout(bundledPresets.cartridges[id]);

describe("needle layouts", () => {
  it("places the number of needles each cartridge has", () => {
    for (const [id, preset] of Object.entries(bundledPresets.cartridges)) {
      expect(needleLayout(preset), id).toHaveLength(preset.needles);
    }
  });

  it("round layouts: a centre needle plus a ring, all within the footprint", () => {
    const rl7 = layoutOf("rl-7");
    const reach = (1.2 - 0.35) / 2;
    expect(rl7.filter((d) => d.u === 0 && d.v === 0)).toHaveLength(1);
    for (const d of rl7.filter((d) => d.u !== 0 || d.v !== 0)) {
      expect(Math.hypot(d.u, d.v)).toBeCloseTo(reach, 9);
    }
    expect(rl7.every((d) => d.weight === 1)).toBe(true);
  });

  it("3 RL puts all three needles on the ring, 120° apart", () => {
    const rl3 = layoutOf("rl-3");
    expect(rl3.every((d) => Math.hypot(d.u, d.v) > 0)).toBe(true);
    const a = rl3.map((d) => Math.atan2(d.v, d.u));
    expect(a[1]! - a[0]!).toBeCloseTo((Math.PI * 2) / 3, 9);
  });

  it("round-loose spreads wider than round-tight", () => {
    const extent = (d: { u: number; v: number }[]) => Math.max(...d.map((n) => Math.hypot(n.u, n.v)));
    expect(extent(layoutOf("rs-9"))).toBeGreaterThan(extent(layoutOf("rl-7")));
  });

  it("round layouts are roughly round: a hexagon is 13% narrower across its flats, no more", () => {
    const rl7 = layoutOf("rl-7");
    const extent = (axis: "u" | "v") => Math.max(...rl7.map((d) => d[axis])) - Math.min(...rl7.map((d) => d[axis]));
    const ratio = extent("u") / extent("v");
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it("flat row: needles lie across the direction of travel", () => {
    const m1 = layoutOf("m1-7");
    expect(m1.every((d) => d.u === 0)).toBe(true);
    const vs = m1.map((d) => d.v);
    expect(Math.min(...vs)).toBeCloseTo(-(2.4 - 0.35) / 2, 9);
    expect(Math.max(...vs)).toBeCloseTo((2.4 - 0.35) / 2, 9);
    // evenly spaced, and the points just touch so the row reads as a band
    const gaps = vs.slice(1).map((v, i) => v - vs[i]!);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!, 9);
    expect(gaps[0]!).toBeLessThanOrEqual(0.35 + 1e-9);
    expect(m1.every((d) => d.weight === 1)).toBe(true);
  });

  it("curved row: an arc whose centre leads, with softer edge needles", () => {
    const rm = layoutOf("rm-15");
    const centre = rm[7]!;
    const edge = rm[0]!;
    expect(rm[14]!.u).toBeCloseTo(edge.u, 9); // symmetric
    expect(centre.u).toBeGreaterThan(edge.u); // the middle bows forward
    expect(centre.weight).toBe(1);
    expect(edge.weight).toBeCloseTo(EDGE_WEIGHT, 9);
    expect(rm[3]!.weight).toBeGreaterThan(edge.weight);
    expect(rm[3]!.weight).toBeLessThan(centre.weight);
    // the arc is centred on the hit position
    expect(rm.reduce((sum, d) => sum + d.u, 0) / rm.length).toBeCloseTo(0, 1);
    // and its width matches the footprint
    expect(Math.max(...rm.map((d) => d.v)) - Math.min(...rm.map((d) => d.v))).toBeCloseTo(5 - 0.35, 9);
  });

  it("a single needle sits on the hit position", () => {
    expect(needleLayout({ layout: "flat-row", needles: 1, needleMm: 0.35, footprintMm: 1 })).toEqual([
      { u: 0, v: 0, weight: 1 },
    ]);
  });
});
