import { describe, expect, it } from "vitest";
import raw from "./cartridges.json";
import { bundledPresets, parsePresets, PresetError } from "./index";

type Raw = {
  version: unknown;
  cartridges: Record<string, Record<string, unknown>>;
  ink: Record<string, unknown>;
  trauma?: unknown;
  render: Record<string, unknown>;
  [key: string]: unknown;
};

const cartridge = (j: Raw, id: string) => j.cartridges[id]!;
const clone = () => structuredClone(raw) as unknown as Raw;

describe("bundled presets", () => {
  it("match the values in ENGINE.md §4", () => {
    const c = bundledPresets.cartridges;
    expect(bundledPresets.version).toBe(2);
    expect(c["rl-7"]).toEqual({
      group: "RL",
      needles: 7,
      needleMm: 0.35,
      layout: "round-tight",
      footprintMm: 1.2,
      inkPerHit: 0.2,
      traumaPerHit: 0.014,
      spreadMm: 0.05,
    });
    expect(c["m1-7"].layout).toBe("flat-row");
    expect(c["rm-15"].layout).toBe("curved-row");
    expect(c["rs-9"].layout).toBe("round-loose");
    expect(c["rm-15"].footprintMm).toBe(5);
    expect(bundledPresets.ink).toEqual({ consumptionPerHit: 0.00018, fadeBelow: 0.25 });
    expect(bundledPresets.trauma).toEqual({ overworkThreshold: 0.6, blowoutDepth: 0.85 });
    expect(bundledPresets.render).toEqual({ healedInkFactor: 0.85, healedBlurMm: 0.12, freshRedness: 0.55 });
  });
});

describe("parsePresets", () => {
  it("accepts the shipped file", () => {
    expect(() => parsePresets(clone())).not.toThrow();
  });

  it("rejects non-objects and a missing cartridge", () => {
    expect(() => parsePresets(null)).toThrow(PresetError);
    expect(() => parsePresets([])).toThrow(PresetError);
    const missing = clone();
    delete missing.cartridges["rs-9"];
    expect(() => parsePresets(missing)).toThrow(/rs-9/);
  });

  it("rejects an unsupported version", () => {
    const j = clone();
    j.version = 3;
    expect(() => parsePresets(j)).toThrow(/version/);
  });

  it("rejects an unknown layout", () => {
    const j = clone();
    cartridge(j, "rl-3").layout = "triangle";
    expect(() => parsePresets(j)).toThrow(/layout/);
  });

  it("rejects out-of-range and non-numeric values", () => {
    for (const [mutate, expected] of [
      [(j: Raw) => (cartridge(j, "rl-7").needles = 0), /needles/],
      [(j: Raw) => (cartridge(j, "rl-7").needles = 2.5), /needles/],
      [(j: Raw) => (cartridge(j, "m1-7").inkPerHit = 1.5), /inkPerHit/],
      [(j: Raw) => (cartridge(j, "m1-7").needleMm = -0.1), /needleMm/],
      [(j: Raw) => (cartridge(j, "m1-7").spreadMm = "0.05"), /spreadMm/],
      [(j: Raw) => (j.ink.fadeBelow = 2), /fadeBelow/],
      [(j: Raw) => (j.render.freshRedness = Number.NaN), /freshRedness/],
      [(j: Raw) => delete j.trauma, /trauma/],
    ] as const) {
      const j = clone();
      mutate(j);
      expect(() => parsePresets(j)).toThrow(expected);
    }
  });

  it("ignores extra keys, so newer files still load", () => {
    const j = clone();
    cartridge(j, "rl-3").futureField = 1;
    j.extra = true;
    expect(() => parsePresets(j)).not.toThrow();
  });
});
