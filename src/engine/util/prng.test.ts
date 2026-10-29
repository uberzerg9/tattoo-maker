import { describe, expect, it } from "vitest";
import { hashSeed, mulberry32 } from "./prng";

describe("hashSeed", () => {
  it("is deterministic for the same (stroke, hit)", () => {
    expect(hashSeed(3, 17)).toBe(hashSeed(3, 17));
  });

  it("differs between hits and between strokes", () => {
    const seeds = new Set<number>();
    for (let stroke = 1; stroke <= 20; stroke++) {
      for (let hit = 0; hit < 200; hit++) seeds.add(hashSeed(stroke, hit));
    }
    expect(seeds.size).toBe(20 * 200);
  });

  it("returns an unsigned 32-bit integer", () => {
    for (let i = 0; i < 100; i++) {
      const s = hashSeed(i, i * 7);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 32);
    }
  });
});

describe("mulberry32", () => {
  it("replays the same sequence from the same seed", () => {
    const a = mulberry32(hashSeed(1, 2));
    const b = mulberry32(hashSeed(1, 2));
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it("stays within [0, 1)", () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
