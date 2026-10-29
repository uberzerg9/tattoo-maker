import { describe, expect, it } from "vitest";
import { SHEET_MM, TEXELS_PER_MM } from "./constants";
import { MAX_STENCIL_HEIGHT_MM, clampPlacement, defaultPlacement, sheetToStencil, stencilCorners, stencilSizeMm, stencilToSheet } from "./stencil";
import type { StencilPlacement } from "./types";

const size = { widthMm: 80, heightMm: 120 };

describe("stencil placement", () => {
  it("starts centred, upright, at full size", () => {
    expect(defaultPlacement()).toEqual({ centerXMm: 100, centerYMm: 75, rotationDeg: 0, scale: 1 });
  });

  it("reads the raster size at the engine's texel size", () => {
    expect(stencilSizeMm(819, 1229).heightMm).toBeCloseTo(1229 / TEXELS_PER_MM, 9);
  });

  it("maps the stencil centre to the placement centre and its corners round it", () => {
    const p: StencilPlacement = { centerXMm: 60, centerYMm: 50, rotationDeg: 0, scale: 1 };
    const c = stencilToSheet(0.5, 0.5, p, size);
    expect(c.x).toBeCloseTo(60, 9);
    expect(c.y).toBeCloseTo(50, 9);
    const [tl, tr, br, bl] = stencilCorners(p, size);
    expect(tl).toEqual({ x: 60 - 40, y: 50 - 60 });
    expect(br!.x).toBeCloseTo(100, 9);
    expect(br!.y).toBeCloseTo(110, 9);
    expect(tr!.x - tl!.x).toBeCloseTo(80, 9);
    expect(bl!.y - tl!.y).toBeCloseTo(120, 9);
  });

  it("scales about the centre", () => {
    const p: StencilPlacement = { centerXMm: 100, centerYMm: 75, rotationDeg: 0, scale: 0.5 };
    const [tl, , br] = stencilCorners(p, size);
    expect(br!.x - tl!.x).toBeCloseTo(40, 9);
    expect(br!.y - tl!.y).toBeCloseTo(60, 9);
  });

  it("rotates clockwise on screen, like the view", () => {
    const p: StencilPlacement = { centerXMm: 100, centerYMm: 75, rotationDeg: 90, scale: 1 };
    const right = stencilToSheet(1, 0.5, p, size); // the middle of the right edge
    expect(right.x).toBeCloseTo(100, 9);
    expect(right.y).toBeGreaterThan(75); // turned to point down
  });

  it("round-trips sheet → stencil → sheet at any rotation and scale", () => {
    for (const rotationDeg of [-170, -90, -33, 0, 17, 90, 135, 180]) {
      for (const scale of [0.25, 1, 1.4]) {
        const p: StencilPlacement = { centerXMm: 83, centerYMm: 61, rotationDeg, scale };
        for (const [x, y] of [[10, 10], [100, 75], [190, 140], [47.3, 99.9]] as const) {
          const { u, v } = sheetToStencil(x, y, p, size);
          const back = stencilToSheet(u, v, p, size);
          expect(back.x).toBeCloseTo(x, 6);
          expect(back.y).toBeCloseTo(y, 6);
        }
      }
    }
  });

  it("reports positions outside the stencil as outside 0..1", () => {
    const p = defaultPlacement();
    const inside = sheetToStencil(100, 75, p, size);
    expect(inside.u).toBeCloseTo(0.5, 9);
    expect(sheetToStencil(100 + 41, 75, p, size).u).toBeGreaterThan(1);
    expect(sheetToStencil(100, 75 - 61, p, size).v).toBeLessThan(0);
  });

  it("clamps the size to the sheet: at most 15 cm tall and 20 cm wide", () => {
    const big = clampPlacement({ ...defaultPlacement(), scale: 5 }, size);
    expect(big.scale * size.heightMm).toBeLessThanOrEqual(MAX_STENCIL_HEIGHT_MM + 1e-9);
    const wide = clampPlacement({ ...defaultPlacement(), scale: 5 }, { widthMm: 190, heightMm: 40 });
    expect(wide.scale * 190).toBeLessThanOrEqual(SHEET_MM.width + 1e-9);
    expect(clampPlacement({ ...defaultPlacement(), scale: 0 }, size).scale).toBeGreaterThan(0);
  });

  it("keeps the centre on the sheet and the angle within ±180°", () => {
    const p = clampPlacement({ centerXMm: -50, centerYMm: 999, rotationDeg: 370, scale: 1 }, size);
    expect(p.centerXMm).toBe(0);
    expect(p.centerYMm).toBe(SHEET_MM.height);
    expect(p.rotationDeg).toBeCloseTo(10, 9);
    expect(clampPlacement({ ...defaultPlacement(), rotationDeg: -190 }, size).rotationDeg).toBeCloseTo(170, 9);
  });
});
