import { describe, expect, it } from "vitest";
import { bundledPresets } from "../presets";
import { BLOWOUT_HALO_SHARE, BLOWOUT_HALO_WIDTH, TRAUMA_RADIUS_SCALE, depthCurve, dotAmount, inkFactor, isBlowout, traumaAmount } from "./deposit";

describe("depthCurve", () => {
  it("is about 0 when shallow and 1 from 0.6 up (ENGINE.md §5)", () => {
    expect(depthCurve(0)).toBe(0);
    expect(depthCurve(0.1)).toBeLessThan(0.03);
    expect(depthCurve(0.6)).toBe(1);
    expect(depthCurve(1)).toBe(1);
  });

  it("still marks a hit at depth 0.15, faintly", () => {
    expect(depthCurve(0.15)).toBeGreaterThan(0.05);
    expect(depthCurve(0.15)).toBeLessThan(0.15);
  });

  it("rises monotonically in between", () => {
    let prev = -1;
    for (let d = 0; d <= 1.0001; d += 0.025) {
      const v = depthCurve(d);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(depthCurve((0.05 + 0.6) / 2)).toBeCloseTo(0.5, 9);
  });

  it("gives the mouse depth of 0.5 most, but not all, of the ink", () => {
    expect(depthCurve(0.5)).toBeGreaterThan(0.8);
    expect(depthCurve(0.5)).toBeLessThan(1);
  });
});

describe("inkFactor", () => {
  it("is 1 while the cartridge holds at least fadeBelow", () => {
    expect(inkFactor(1, 0.25)).toBe(1);
    expect(inkFactor(0.25, 0.25)).toBe(1);
  });

  it("falls linearly to 0 when dry", () => {
    expect(inkFactor(0.125, 0.25)).toBeCloseTo(0.5, 9);
    expect(inkFactor(0, 0.25)).toBe(0);
    expect(inkFactor(-0.1, 0.25)).toBe(0);
  });
});

describe("dotAmount", () => {
  const rl7 = bundledPresets.cartridges["rl-7"];
  const fade = bundledPresets.ink.fadeBelow;

  it("multiplies inkPerHit, the depth curve and the ink factor", () => {
    expect(dotAmount({ depth: 1, inkLevel: 1 }, rl7, fade)).toBeCloseTo(0.2, 9);
    expect(dotAmount({ depth: 0.5, inkLevel: 1 }, rl7, fade)).toBeCloseTo(0.2 * depthCurve(0.5), 9);
    expect(dotAmount({ depth: 1, inkLevel: 0.125 }, rl7, fade)).toBeCloseTo(0.1, 9);
  });

  it("deposits nothing for a surface touch or an empty cartridge", () => {
    expect(dotAmount({ depth: 0, inkLevel: 1 }, rl7, fade)).toBe(0);
    expect(dotAmount({ depth: 1, inkLevel: 0 }, rl7, fade)).toBe(0);
  });

  it("leaves a shallow hit faint", () => {
    expect(dotAmount({ depth: 0.15, inkLevel: 1 }, rl7, fade)).toBeLessThan(0.2 * 0.15);
    expect(dotAmount({ depth: 0.15, inkLevel: 1 }, rl7, fade)).toBeGreaterThan(0);
  });
});

describe("traumaAmount", () => {
  const rl7 = bundledPresets.cartridges["rl-7"];

  it("is traumaPerHit × the depth curve (ENGINE.md §6)", () => {
    expect(traumaAmount({ depth: 1 }, rl7)).toBeCloseTo(0.014, 9);
    expect(traumaAmount({ depth: 0.5 }, rl7)).toBeCloseTo(0.014 * depthCurve(0.5), 9);
    expect(traumaAmount({ depth: 0 }, rl7)).toBe(0);
  });

  it("does not depend on the ink in the cartridge", () => {
    // dotAmount takes inkLevel; traumaAmount has no such input at all
    expect(dotAmount({ depth: 1, inkLevel: 0 }, rl7, 0.25)).toBe(0);
    expect(traumaAmount({ depth: 1 }, rl7)).toBeGreaterThan(0);
  });

  it("makes the trauma dot a little wider than the ink dot", () => {
    expect(TRAUMA_RADIUS_SCALE).toBeGreaterThan(1);
    expect(TRAUMA_RADIUS_SCALE).toBeLessThan(3);
  });
});

describe("blowout", () => {
  it("starts above trauma.blowoutDepth, not at it", () => {
    expect(isBlowout({ depth: 0.85 }, 0.85)).toBe(false);
    expect(isBlowout({ depth: 0.86 }, 0.85)).toBe(true);
    expect(isBlowout({ depth: 0.5 }, 0.85)).toBe(false);
  });

  it("uses a wide halo at a tenth of the ink", () => {
    expect(BLOWOUT_HALO_WIDTH).toBe(3);
    expect(BLOWOUT_HALO_SHARE).toBe(0.1);
  });
});
