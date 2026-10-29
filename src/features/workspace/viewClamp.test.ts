import { describe, expect, it } from "vitest";
import { sheetCornersScreen } from "../../engine/view";
import type { Point } from "../../engine/view";
import { PAN_VISIBLE_MARGIN_PX, ZOOM_MAX, ZOOM_MIN } from "./config";
import { clampOffset } from "./viewClamp";

/** Smallest supported desktop window is 1280 px wide (SPEC). */
const stages = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
/** The clamp promises PAN_VISIBLE_MARGIN_PX; check a little less to stay clear of rounding. */
const MIN_VISIBLE_PX = 100;

/** Separating-axis test between two convex polygons. */
function polygonsOverlap(a: Point[], b: Point[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const axis = { x: -(q.y - p.y), y: q.x - p.x };
      const project = (pts: Point[]) => {
        const v = pts.map((pt) => pt.x * axis.x + pt.y * axis.y);
        return [Math.min(...v), Math.max(...v)] as const;
      };
      const [minA, maxA] = project(a);
      const [minB, maxB] = project(b);
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

describe("pan clamp", () => {
  it("keeps the sheet on screen at any zoom and rotation, even when dragged to the extreme", () => {
    const zooms = [ZOOM_MIN, 0.75, 1, 1.5, 2, 2.5, ZOOM_MAX];
    const rotations = [-180, -135, -90, -45, -15, 0, 5, 15, 45, 90, 135, 180];
    const far = 100_000;

    for (const stage of stages) {
      const visibleArea = [
        { x: MIN_VISIBLE_PX, y: MIN_VISIBLE_PX },
        { x: stage.width - MIN_VISIBLE_PX, y: MIN_VISIBLE_PX },
        { x: stage.width - MIN_VISIBLE_PX, y: stage.height - MIN_VISIBLE_PX },
        { x: MIN_VISIBLE_PX, y: stage.height - MIN_VISIBLE_PX },
      ];

      for (const zoom of zooms) {
        for (const rotationDeg of rotations) {
          for (const [sx, sy] of [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
            [1, 0],
            [0, -1],
          ] as const) {
            const { offsetX, offsetY } = clampOffset(
              sx * far,
              sy * far,
              zoom,
              rotationDeg,
              stage,
            );
            const corners = sheetCornersScreen(
              { zoom, offsetX, offsetY, rotationDeg },
              stage,
            );
            expect(
              polygonsOverlap(corners, visibleArea),
              `${stage.width}×${stage.height}, zoom ${zoom}, rotation ${rotationDeg}°, drag (${sx}, ${sy})`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("leaves offsets inside the limits untouched", () => {
    expect(clampOffset(10, -20, 1, 30, stages[0]!)).toEqual({
      offsetX: 10,
      offsetY: -20,
    });
  });

  it("slides along the limit instead of sticking when dragged past a corner", () => {
    const stage = stages[1]!;
    const a = clampOffset(5000, 100, 1, 0, stage);
    const b = clampOffset(5000, 200, 1, 0, stage);
    expect(a.offsetX).toBeCloseTo(b.offsetX, 6);
    expect(b.offsetY).toBeGreaterThan(a.offsetY);
  });

  it("promises PAN_VISIBLE_MARGIN_PX of overlap", () => {
    const stage = stages[0]!;
    const { offsetX } = clampOffset(10_000, 0, 1, 0, stage);
    const corners = sheetCornersScreen(
      { zoom: 1, offsetX, offsetY: 0, rotationDeg: 0 },
      stage,
    );
    expect(stage.width - corners[0]!.x).toBeCloseTo(PAN_VISIBLE_MARGIN_PX, 6);
  });
});
