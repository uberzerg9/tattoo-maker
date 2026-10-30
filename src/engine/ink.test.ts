import { describe, expect, it } from "vitest";
import { dotAmount } from "./brushes/deposit";
import type { Hit } from "./hit";
import { CAP_COST_PER_DIP, CAP_ORDER, INK_TONE, InkSupply, inkTransmittance, levelFromTone } from "./ink";
import { bundledPresets } from "./presets";
import type { CartridgeId } from "./types";

const hit = (cartridgeId: CartridgeId = "rl-7"): Hit => ({
  x: 10, y: 10, t: 0, speed: 0, depth: 0.5, angle: 0,
  cartridgeId, inkTone: -1, inkLevel: -1, seed: 1,
});
const hits = (n: number, id: CartridgeId = "rl-7") => Array.from({ length: n }, () => hit(id));

describe("levels and tones", () => {
  it("orders the caps from darkest to lightest", () => {
    const tones = CAP_ORDER.map((c) => INK_TONE[c]);
    expect([...tones].sort((a, b) => a - b)).toEqual(tones);
    expect(CAP_ORDER).toEqual(["black", "g60", "g30", "g10", "white"]);
  });

  it("maps a tone back to its level", () => {
    CAP_ORDER.forEach((cap, i) => expect(levelFromTone(INK_TONE[cap])).toBe(i));
    expect(levelFromTone(0.69)).toBe(2);
  });

  it("lets lighter inks pass more light", () => {
    const t = [0, 1, 2, 3].map((l) => inkTransmittance(l)[0]);
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    expect(t[0]).toBeGreaterThan(0); // never pure black
  });
});

describe("InkSupply", () => {
  const presets = bundledPresets;

  it("starts with full caps and cartridges full of black", () => {
    const s = new InkSupply(presets);
    expect(s.capLevels()).toEqual({ black: 1, g60: 1, g30: 1, g10: 1, white: 1 });
    expect(s.level("m1-7")).toBe(1);
    expect(s.tone("m1-7")).toBe(0);
  });

  it("uses consumptionPerHit × needles on every hit (ENGINE.md §5)", () => {
    const s = new InkSupply(presets);
    const hs = hits(10);
    s.apply(hs);
    const perHit = 0.00018 * 7;
    hs.forEach((h, i) => expect(h.inkLevel).toBeCloseTo(1 - i * perHit, 9)); // level at the moment of the hit
    expect(s.level("rl-7")).toBeCloseTo(1 - 10 * perHit, 9);
    // more needles, faster drain
    const rm = hits(10, "rm-15");
    s.apply(rm);
    expect(s.level("rm-15")).toBeCloseTo(1 - 10 * 0.00018 * 15, 9);
  });

  it("never goes below empty, and an empty needle still hits", () => {
    const s = new InkSupply(presets);
    const hs = hits(1200); // empty after about 794 hits (0.00126 each)
    s.apply(hs);
    expect(s.level("rl-7")).toBe(0);
    expect(hs[1199]!.inkLevel).toBe(0);
    expect(hs.length).toBe(1200); // nothing dropped: hits still happen, they just deposit nothing
  });

  it("deposits fully, fades, then deposits nothing", () => {
    const s = new InkSupply(presets);
    const hs = hits(1000);
    s.apply(hs);
    const preset = presets.cartridges["rl-7"];
    const amounts = hs.map((h) => dotAmount(h, preset, presets.ink.fadeBelow));
    const full = amounts[0]!;
    expect(full).toBeGreaterThan(0);
    // full strength while the level is at or above fadeBelow
    const firstFade = hs.findIndex((h) => h.inkLevel < presets.ink.fadeBelow);
    for (let i = 0; i < firstFade; i++) expect(amounts[i]).toBeCloseTo(full, 9);
    // then a monotonic fade to zero
    for (let i = firstFade + 1; i < amounts.length; i++) expect(amounts[i]!).toBeLessThanOrEqual(amounts[i - 1]! + 1e-12);
    expect(amounts[firstFade + 5]!).toBeLessThan(full);
    expect(amounts[999]).toBe(0);
    // about 6 s of strokes at full strength, 2 s fading, at 100 Hz
    expect(firstFade).toBeGreaterThan(590);
    expect(firstFade).toBeLessThan(600);
  });

  it("dip refills the cartridge with the selected cap and takes a little from that cap", () => {
    const s = new InkSupply(presets);
    s.apply(hits(300));
    expect(s.level("rl-7")).toBeLessThan(0.7);
    expect(s.dip("rl-7", "g30")).toBe(true);
    expect(s.level("rl-7")).toBe(1);
    expect(s.tone("rl-7")).toBe(INK_TONE.g30);
    expect(s.capLevels().g30).toBeCloseTo(1 - CAP_COST_PER_DIP, 9);
    expect(s.capLevels().black).toBe(1);
  });

  it("selecting a cap alone changes nothing: only dip loads the needle", () => {
    const s = new InkSupply(presets);
    const hs = hits(5);
    s.apply(hs);
    // (the engine only remembers the selected cap; the supply is untouched until dip())
    expect(hs.every((h) => h.inkTone === INK_TONE.black)).toBe(true);
    s.dip("rl-7", "g10");
    const after = hits(3);
    s.apply(after);
    expect(after.every((h) => h.inkTone === INK_TONE.g10)).toBe(true);
  });

  it("ink dipped in a cap keeps its tone until the next dip", () => {
    const s = new InkSupply(presets);
    s.dip("rl-7", "g60");
    const a = hits(50);
    s.apply(a);
    expect(new Set(a.map((h) => h.inkTone))).toEqual(new Set([INK_TONE.g60]));
  });

  it("refuses to dip into an empty cap and leaves everything as it was", () => {
    const s = new InkSupply(presets);
    let dips = 0;
    while (s.dip("rl-7", "white")) dips++;
    expect(dips).toBe(Math.ceil(1 / CAP_COST_PER_DIP - 1e-9));
    expect(s.capLevels().white).toBe(0);
    expect(s.canDip("white")).toBe(false);
    s.apply(hits(1000)); // drain the cartridge (794 hits at 0.00126 each)
    expect(s.level("rl-7")).toBe(0);
    expect(s.dip("rl-7", "white")).toBe(false);
    expect(s.level("rl-7")).toBe(0); // not refilled
    expect(s.capLevels().white).toBe(0);
    expect(s.dip("rl-7", "black")).toBe(true); // other caps still work
  });

  it("keeps ink per cartridge", () => {
    const s = new InkSupply(presets);
    s.dip("m1-7", "g30");
    s.apply(hits(50, "rl-7"));
    expect(s.level("m1-7")).toBe(1);
    expect(s.tone("m1-7")).toBe(INK_TONE.g30);
    expect(s.tone("rl-7")).toBe(INK_TONE.black);
    expect(s.level("rl-7")).toBeLessThan(1);
  });
});

describe("InkSupply undo snapshots", () => {
  it("gives back the caps and every cartridge's ink and tone", () => {
    const supply = new InkSupply(bundledPresets);
    supply.dip("rl-7", "g30");
    const before = supply.snapshot();
    const levelBefore = supply.level("rl-7");

    supply.dip("rl-7", "black");
    supply.dip("m1-7", "white");
    supply.apply(hits(300));
    expect(supply.level("rl-7")).toBeLessThan(levelBefore);

    supply.restore(before);
    expect(supply.level("rl-7")).toBe(levelBefore);
    expect(supply.tone("rl-7")).toBe(INK_TONE.g30);
    expect(supply.capLevels()).toEqual(before.caps);
    expect(supply.level("m1-7")).toBe(1); // dipped after the snapshot: back to the untouched default
  });

  it("a snapshot is a copy: later use does not change it", () => {
    const supply = new InkSupply(bundledPresets);
    const snap = supply.snapshot();
    supply.dip("rl-7", "black");
    expect(snap.caps.black).toBe(1);
  });
});
