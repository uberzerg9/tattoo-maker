import { describe, expect, it } from "vitest";
import { CSS_PX_PER_MM, SHEET_MM } from "./constants";
import {
  isInsideSheet,
  screenToSheetMm,
  sheetCornersScreen,
  sheetMmToScreen,
} from "./view";
import type { View } from "./view";

const stage = { width: 1440, height: 900 };

describe("view transform", () => {
  it("maps the sheet centre to the stage centre plus the offset", () => {
    const view: View = { zoom: 2, offsetX: 30, offsetY: -20, rotationDeg: 70 };
    const p = sheetMmToScreen(
      SHEET_MM.width / 2,
      SHEET_MM.height / 2,
      view,
      stage,
    );
    expect(p.x).toBeCloseTo(720 + 30, 9);
    expect(p.y).toBeCloseTo(450 - 20, 9);
  });

  it("scales by CSS_PX_PER_MM * zoom with no rotation", () => {
    const view: View = { zoom: 1.5, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const a = sheetMmToScreen(100, 75, view, stage);
    const b = sheetMmToScreen(110, 75, view, stage);
    expect(b.x - a.x).toBeCloseTo(10 * CSS_PX_PER_MM * 1.5, 9);
    expect(b.y - a.y).toBeCloseTo(0, 9);
  });

  it("rotates clockwise on screen, like CSS rotate", () => {
    const view: View = { zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 90 };
    const right = sheetMmToScreen(110, 75, view, stage);
    // a point to the right of the centre ends up below it
    expect(right.x).toBeCloseTo(720, 9);
    expect(right.y).toBeGreaterThan(450);
  });

  it("round-trips screen → mm → screen exactly", () => {
    const zooms = [0.5, 1, 1.25, 2, 3];
    const rotations = [-180, -135, -45, -15, 0, 5, 15, 45, 90, 135, 180];
    const points = [
      [0, 0],
      [720, 450],
      [1439, 899],
      [133.7, 612.3],
      [1001.1, 77.7],
    ] as const;
    for (const zoom of zooms) {
      for (const rotationDeg of rotations) {
        const view: View = { zoom, offsetX: 83, offsetY: -41, rotationDeg };
        for (const [x, y] of points) {
          const mm = screenToSheetMm(x, y, view, stage);
          const back = sheetMmToScreen(mm.x, mm.y, view, stage);
          expect(back.x).toBeCloseTo(x, 6);
          expect(back.y).toBeCloseTo(y, 6);
        }
      }
    }
  });

  it("lands a hit exactly under the cursor at 300% zoom rotated 45°", () => {
    const view: View = { zoom: 3, offsetX: 0, offsetY: 0, rotationDeg: 45 };
    const mm = screenToSheetMm(800, 500, view, stage);
    const px = sheetMmToScreen(mm.x, mm.y, view, stage);
    expect(Math.hypot(px.x - 800, px.y - 500)).toBeLessThan(1e-6);
    // 80 css px right and 50 down of the centre, rotated back by 45° and divided by zoom
    const rx =
      (80 * Math.cos(Math.PI / 4) + 50 * Math.sin(Math.PI / 4)) /
      3 /
      CSS_PX_PER_MM;
    expect(mm.x).toBeCloseTo(SHEET_MM.width / 2 + rx, 9);
  });

  it("tells whether a point is on the sheet", () => {
    expect(isInsideSheet({ x: 0, y: 0 })).toBe(true);
    expect(isInsideSheet({ x: 200, y: 150 })).toBe(true);
    expect(isInsideSheet({ x: 200.01, y: 10 })).toBe(false);
    expect(isInsideSheet({ x: -0.01, y: 10 })).toBe(false);
  });

  it("returns four corners", () => {
    const corners = sheetCornersScreen(
      { zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 },
      stage,
    );
    expect(corners).toHaveLength(4);
    expect(corners[0]?.x).toBeCloseTo(720 - 320, 9);
    expect(corners[2]?.y).toBeCloseTo(450 + 240, 9);
  });
});
