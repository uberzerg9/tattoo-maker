import { describe, expect, it } from "vitest";
import { FIXED_DEPTH, depthFromPointer, pressureToDepth } from "./hit";

describe("depth from the pointer", () => {
  it("gives mouse and touch a fixed depth whatever they report", () => {
    expect(depthFromPointer("mouse", 0)).toBe(FIXED_DEPTH);
    expect(depthFromPointer("mouse", 0.5)).toBe(FIXED_DEPTH);
    expect(depthFromPointer("touch", 0.9)).toBe(FIXED_DEPTH);
  });

  it("maps pen pressure through the curve", () => {
    expect(depthFromPointer("pen", 1)).toBeCloseTo(1, 9);
    expect(depthFromPointer("pen", 0.3)).toBeCloseTo(pressureToDepth(0.3), 9);
  });

  it("falls back to the fixed depth for a pen reporting zero pressure", () => {
    expect(depthFromPointer("pen", 0)).toBe(FIXED_DEPTH);
  });

  it("is monotonic and stays within 0..1", () => {
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const d = pressureToDepth(p);
      expect(d).toBeGreaterThanOrEqual(prev);
      expect(d).toBeLessThanOrEqual(1);
      prev = d;
    }
    expect(pressureToDepth(-1)).toBe(0);
    expect(pressureToDepth(5)).toBe(1);
  });
});
