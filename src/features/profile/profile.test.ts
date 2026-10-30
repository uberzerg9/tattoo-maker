import { describe, expect, it } from "vitest";
import { DEFAULT_PANEL_POSITIONS, PANEL_IDS } from "../workspace/config";
import { layoutOf, sanitizePanelLayout } from "../workspace/panelLayout";
import { displayStep, fromDisplay, isUnits, toDisplay } from "../workspace/units";
import { DEFAULT_SETTINGS, clampHz, sanitizeSettings } from "./profileSettings";

describe("units", () => {
  it("converts between cm and inches both ways", () => {
    expect(toDisplay(12, "cm")).toBe(12);
    expect(toDisplay(2.54, "in")).toBeCloseTo(1);
    expect(fromDisplay(1, "in")).toBeCloseTo(2.54);
    expect(fromDisplay(toDisplay(12, "in"), "in")).toBeCloseTo(12);
    expect(displayStep("cm")).toBe(0.5);
    expect(displayStep("in")).toBe(0.25);
    expect(isUnits("in")).toBe(true);
    expect(isUnits("mm")).toBe(false);
  });
});

describe("workspace defaults", () => {
  it("reads valid settings", () => {
    expect(sanitizeSettings({ skinTone: "t5", machineHz: 110, units: "in" })).toEqual({ skinTone: "t5", machineHz: 110, units: "in" });
  });

  it("falls back to the default for anything missing or invalid, field by field", () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ skinTone: "t9", machineHz: "fast", units: "mm" })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ skinTone: "t4" })).toEqual({ ...DEFAULT_SETTINGS, skinTone: "t4" });
  });

  it("keeps the speed inside the machine's range, on its step", () => {
    expect(clampHz(10)).toBe(50);
    expect(clampHz(999)).toBe(150);
    expect(clampHz(87)).toBe(85);
    expect(sanitizeSettings({ machineHz: 400 }).machineHz).toBe(150);
  });
});

describe("panel layout", () => {
  const layout = () => ({
    positions: Object.fromEntries(PANEL_IDS.map((id, i) => [id, { side: "right", x: 10 + i, y: 20 + i }])),
    open: Object.fromEntries(PANEL_IDS.map((id, i) => [id, i % 2 === 0])),
  });

  it("round-trips a layout", () => {
    const back = sanitizePanelLayout(layout())!;
    expect(back.positions.carts).toEqual({ side: "right", x: 10, y: 20 });
    expect(back.open.carts).toBe(true);
    expect(back.open.caps).toBe(false);
  });

  it("keeps what is valid and defaults the rest", () => {
    const raw = layout() as { positions: Record<string, unknown>; open: Record<string, unknown> };
    raw.positions.caps = { side: "up", x: 1, y: 1 };
    raw.positions.machine = { side: "left", x: -5, y: 3 };
    raw.positions.skin = { side: "left", x: Number.NaN, y: 3 };
    raw.open.stencil = "yes";
    const back = sanitizePanelLayout(raw)!;
    expect(back.positions.caps).toEqual(DEFAULT_PANEL_POSITIONS.caps);
    expect(back.positions.machine).toEqual(DEFAULT_PANEL_POSITIONS.machine);
    expect(back.positions.skin).toEqual(DEFAULT_PANEL_POSITIONS.skin);
    expect(back.open.stencil).toBe(true);
    expect(back.positions.carts).toEqual({ side: "right", x: 10, y: 20 });
  });

  it("is null when nothing in it is usable", () => {
    for (const bad of [undefined, null, 5, "x", [], {}, { positions: 3, open: [] }, { positions: { carts: { side: "left" } } }]) {
      expect(sanitizePanelLayout(bad)).toBeNull();
    }
  });

  it("rounds positions before saving", () => {
    const l = layoutOf({ ...DEFAULT_PANEL_POSITIONS, carts: { side: "left", x: 24.4, y: 86.6 } }, Object.fromEntries(PANEL_IDS.map((id) => [id, true])) as never);
    expect(l.positions.carts).toEqual({ side: "left", x: 24, y: 87 });
  });
});
