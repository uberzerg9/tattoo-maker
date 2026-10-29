import { describe, expect, it } from "vitest";
import type { Hit } from "../hit";
import { bundledPresets } from "../presets";
import type { CartridgeId } from "../types";
import { depthCurve } from "./deposit";
import { DOT_FLOATS, StampPlanner } from "./stampPlan";

const hit = (over: Partial<Hit> = {}): Hit => ({
  x: 100,
  y: 75,
  t: 0,
  speed: 20,
  depth: 0.5,
  angle: 0,
  cartridgeId: "rl-7",
  inkTone: 0,
  inkLevel: 1,
  seed: 12345,
  ...over,
});

type Dot = { x: number; y: number; radius: number; amount: number; level: number };
const unpack = (batch: { data: Float32Array; count: number }): Dot[] =>
  Array.from({ length: batch.count }, (_, i) => {
    const o = i * DOT_FLOATS;
    return { x: batch.data[o]!, y: batch.data[o + 1]!, radius: batch.data[o + 2]!, amount: batch.data[o + 3]!, level: batch.data[o + 4]! };
  });
/** Ink dots (needles, then any blowout halo). */
const dots = (planner: StampPlanner, hits: Hit[]) => unpack(planner.plan(hits).ink);
const traumaDots = (planner: StampPlanner, hits: Hit[]) => unpack(planner.plan(hits).trauma);

describe("StampPlanner", () => {
  const planner = new StampPlanner(bundledPresets);

  it("makes one dot per needle per hit", () => {
    for (const id of Object.keys(bundledPresets.cartridges) as CartridgeId[]) {
      const needles = bundledPresets.cartridges[id].needles;
      expect(dots(planner, [hit({ cartridgeId: id })]), id).toHaveLength(needles);
      expect(dots(planner, [hit({ cartridgeId: id }), hit({ cartridgeId: id, seed: 9 })])).toHaveLength(needles * 2);
    }
  });

  it("is deterministic: the same hits give the same dots, however they are batched", () => {
    const hits = [hit({ seed: 1 }), hit({ seed: 2, x: 101 }), hit({ seed: 3, x: 102 })];
    const a = dots(planner, hits);
    const b = dots(new StampPlanner(bundledPresets), hits);
    expect(b).toEqual(a);
    const split = [...dots(planner, hits.slice(0, 1)), ...dots(planner, hits.slice(1))];
    expect(split).toEqual(a);
  });

  it("jitters each needle by at most spreadMm, differently for different seeds", () => {
    const spread = bundledPresets.cartridges["rl-7"].spreadMm;
    const base = dots(planner, [hit({ seed: 1 })]);
    const other = dots(planner, [hit({ seed: 2 })]);
    expect(other).not.toEqual(base);
    // the round layout's own offsets are the same, so the difference is only jitter
    for (let i = 0; i < base.length; i++) {
      expect(Math.abs(base[i]!.x - other[i]!.x)).toBeLessThanOrEqual(2 * spread + 1e-9);
      expect(Math.abs(base[i]!.y - other[i]!.y)).toBeLessThanOrEqual(2 * spread + 1e-9);
    }
  });

  it("puts a flat row across the direction of travel", () => {
    const along = (angle: number) =>
      dots(planner, [hit({ cartridgeId: "m1-7", angle })]).map((d) => ({ x: d.x - 100, y: d.y - 75 }));
    const spread = bundledPresets.cartridges["m1-7"].spreadMm;
    const halfRow = (2.4 - 0.35) / 2;

    // travelling along +x: the row runs along y
    const east = along(0);
    expect(Math.max(...east.map((d) => d.y)) - Math.min(...east.map((d) => d.y))).toBeGreaterThan(2 * halfRow - 2 * spread);
    expect(Math.max(...east.map((d) => Math.abs(d.x)))).toBeLessThanOrEqual(spread + 1e-9);

    // travelling along +y: the row runs along x
    const south = along(Math.PI / 2);
    expect(Math.max(...south.map((d) => d.x)) - Math.min(...south.map((d) => d.x))).toBeGreaterThan(2 * halfRow - 2 * spread);
    expect(Math.max(...south.map((d) => Math.abs(d.y)))).toBeLessThanOrEqual(spread + 1e-9);

    // 45°: the row runs along the other diagonal
    const diag = along(Math.PI / 4);
    const first = diag[0]!;
    const last = diag[diag.length - 1]!;
    expect(Math.atan2(last.y - first.y, last.x - first.x)).toBeCloseTo((3 * Math.PI) / 4, 1);
  });

  it("carries the needle weight, depth curve and ink level into each dot", () => {
    const rm = dots(planner, [hit({ cartridgeId: "rm-15", depth: 1, inkTone: 0.7 })]);
    const perHit = bundledPresets.cartridges["rm-15"].inkPerHit;
    expect(rm[7]!.amount).toBeCloseTo(perHit, 6); // centre needle: full weight
    expect(rm[0]!.amount).toBeCloseTo(perHit * 0.5, 6); // edge needle: half
    expect(rm.every((d) => d.level === 2)).toBe(true); // tone 0.7 is grey 30
    expect(rm.slice(0, 15).every((d) => Math.abs(d.radius - 0.175) < 1e-6)).toBe(true); // the 16th dot is the depth-1 blowout halo

    const mouse = dots(planner, [hit({ cartridgeId: "rl-7", depth: 0.5 })]);
    expect(mouse[0]!.amount).toBeCloseTo(0.2 * depthCurve(0.5), 6);
  });

  it("deposits nothing for a dry cartridge but still returns the dots (so replay stays aligned)", () => {
    const dry = dots(planner, [hit({ inkLevel: 0 })]);
    expect(dry).toHaveLength(7);
    expect(dry.every((d) => d.amount === 0)).toBe(true);
  });

  it("scales the dot radius for tuning without changing the amount", () => {
    const base = dots(planner, [hit()]);
    const wide = dots(new StampPlanner(bundledPresets, 1.5), [hit()]);
    // the dots are stored as float32, so compare to about 7 digits
    expect(wide[0]!.radius).toBeCloseTo(base[0]!.radius * 1.5, 6);
    expect(wide[0]!.amount).toBeCloseTo(base[0]!.amount, 6);
    expect(wide[0]!.x).toBeCloseTo(base[0]!.x, 6);
    // a nonsense scale falls back to 1
    expect(dots(new StampPlanner(bundledPresets, 0), [hit()])[0]!.radius).toBeCloseTo(base[0]!.radius, 6);
  });

  it("keeps working past its initial buffer", () => {
    const many = Array.from({ length: 500 }, (_, i) => hit({ cartridgeId: "rm-15", seed: i }));
    const batch = planner.plan(many);
    expect(batch.ink.count).toBe(500 * 15);
    expect(batch.trauma.count).toBe(500 * 15);
  });

  describe("trauma", () => {
    it("adds one trauma dot per needle, in the same place as its ink dot", () => {
      const h = hit({ cartridgeId: "rl-7", seed: 42 });
      const ink = dots(planner, [h]);
      const trauma = traumaDots(planner, [h]);
      expect(trauma).toHaveLength(7);
      trauma.forEach((d, i) => {
        expect(d.x).toBeCloseTo(ink[i]!.x, 6);
        expect(d.y).toBeCloseTo(ink[i]!.y, 6);
      });
    });

    it("adds traumaPerHit × depth curve per dot, a little wider than the ink dot", () => {
      const h = hit({ cartridgeId: "rl-7", depth: 1 });
      const [t0] = traumaDots(planner, [h]);
      const [i0] = dots(planner, [h]);
      expect(t0!.amount).toBeCloseTo(0.014, 6);
      expect(t0!.radius).toBeGreaterThan(i0!.radius);
      expect(t0!.radius).toBeCloseTo(i0!.radius * 1.6, 6);
      expect(traumaDots(planner, [hit({ depth: 0.5 })])[0]!.amount).toBeCloseTo(0.014 * depthCurve(0.5), 6);
    });

    it("does not give edge needles of a curved row less trauma", () => {
      const rm = traumaDots(planner, [hit({ cartridgeId: "rm-15", depth: 1 })]);
      expect(rm[0]!.amount).toBeCloseTo(rm[7]!.amount, 9);
    });

    it("still adds trauma when the cartridge is dry", () => {
      const dry = hit({ inkLevel: 0, depth: 0.5 });
      expect(dots(planner, [dry]).every((d) => d.amount === 0)).toBe(true);
      const trauma = traumaDots(planner, [dry]);
      expect(trauma).toHaveLength(7);
      expect(trauma.every((d) => d.amount > 0)).toBe(true);
    });

    it("scales the trauma dot with the tuning scale too", () => {
      const wide = traumaDots(new StampPlanner(bundledPresets, 2), [hit()]);
      const base = traumaDots(planner, [hit()]);
      expect(wide[0]!.radius).toBeCloseTo(base[0]!.radius * 2, 6);
    });
  });

  describe("blowout", () => {
    const deep = (over: Partial<Hit> = {}) => hit({ depth: 0.9, ...over });

    it("adds one wide, faint halo to the ink when the needle goes too deep", () => {
      const ink = dots(planner, [deep()]);
      expect(ink).toHaveLength(7 + 1);
      const halo = ink[7]!;
      const preset = bundledPresets.cartridges["rl-7"];
      expect(halo.radius).toBeCloseTo((preset.footprintMm * 3) / 2, 5); // about three footprints across
      expect(halo.radius).toBeGreaterThan(ink[0]!.radius * 5);
      expect(halo.amount).toBeCloseTo(ink[0]!.amount * 0.1, 6); // a tenth of a needle dot's ink
      expect(halo.x).toBeCloseTo(100, 6);
      expect(halo.y).toBeCloseTo(75, 6);
    });

    it("carries the hit's ink level, so grey stays grey", () => {
      const halo = dots(planner, [deep({ inkTone: 0.7 })])[7]!;
      expect(halo.level).toBe(2);
    });

    it("is not part of the trauma", () => {
      expect(traumaDots(planner, [deep()])).toHaveLength(7);
    });

    it("needs depth above blowoutDepth, and ink to spread", () => {
      expect(dots(planner, [hit({ depth: 0.85 })])).toHaveLength(7);
      expect(dots(planner, [hit({ depth: 0.5 })])).toHaveLength(7);
      expect(dots(planner, [deep({ inkLevel: 0 })])).toHaveLength(7);
    });

    it("scales with the cartridge footprint", () => {
      const rm = dots(planner, [deep({ cartridgeId: "rm-15" })]);
      expect(rm).toHaveLength(15 + 1);
      expect(rm[15]!.radius).toBeCloseTo((5 * 3) / 2, 5);
    });

    it("is deterministic", () => {
      expect(dots(planner, [deep({ seed: 5 })])).toEqual(dots(new StampPlanner(bundledPresets), [deep({ seed: 5 })]));
    });
  });
});
