import { SHEET_CSS_PX } from "../../engine/constants";
import type { Point, Size } from "../../engine/view";
import { PAN_VISIBLE_MARGIN_PX } from "./config";

function cross(o: Point, a: Point, b: Point) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Convex hull, counter-clockwise (Andrew's monotone chain). */
function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const build = (input: Point[]) => {
    const out: Point[] = [];
    for (const p of input) {
      while (
        out.length >= 2 &&
        cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0
      )
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...build(pts), ...build([...pts].reverse())];
}

function nearestOnSegment(p: Point, a: Point, b: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2),
        );
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/**
 * Keeps the sheet from being dragged off the stage: the rotated, zoomed sheet must always
 * overlap the stage (inset by PAN_VISIBLE_MARGIN_PX) so it can be grabbed again.
 *
 * The sheet centre may move inside the Minkowski sum of that inset stage rectangle and the
 * sheet rectangle (it is centrally symmetric). Offsets outside it are projected onto its
 * boundary, so dragging past a limit slides along the edge.
 */
export function clampOffset(
  x: number,
  y: number,
  zoom: number,
  rotationDeg: number,
  stage: Size,
): { offsetX: number; offsetY: number } {
  const hx = Math.max(0, stage.width / 2 - PAN_VISIBLE_MARGIN_PX);
  const hy = Math.max(0, stage.height / 2 - PAN_VISIBLE_MARGIN_PX);
  const sw = (SHEET_CSS_PX.width / 2) * zoom;
  const sh = (SHEET_CSS_PX.height / 2) * zoom;
  const a = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  const sum: Point[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cornerX = sx * sw * cos - sy * sh * sin;
      const cornerY = sx * sw * sin + sy * sh * cos;
      for (const rx of [-hx, hx]) {
        for (const ry of [-hy, hy])
          sum.push({ x: cornerX + rx, y: cornerY + ry });
      }
    }
  }
  const hull = convexHull(sum);

  const p = { x, y };
  const inside = hull.every(
    (v, i) => cross(v, hull[(i + 1) % hull.length]!, p) >= 0,
  );
  if (inside) return { offsetX: x, offsetY: y };

  let best = hull[0]!;
  let bestDist = Infinity;
  hull.forEach((v, i) => {
    const q = nearestOnSegment(p, v, hull[(i + 1) % hull.length]!);
    const d = (q.x - x) ** 2 + (q.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = q;
    }
  });
  return { offsetX: best.x, offsetY: best.y };
}
