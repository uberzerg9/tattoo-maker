import { CSS_PX_PER_MM, SHEET_MM } from "../../engine/constants";
import { screenToSheetMm } from "../../engine/view";
import type { Point, Size, View } from "../../engine/view";

/** Two-finger twist snaps back to upright when it ends this close to 0°. */
export const ROTATION_SNAP_DEG = 3;

/** The view and the two fingers (stage coordinates) when a pinch began. */
export interface PinchStart {
  view: View;
  a: Point;
  b: Point;
}

export interface PinchLimits {
  minZoom: number;
  maxZoom: number;
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const angleDeg = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** Into (-180, 180]. */
export function normalizeDeg(deg: number): number {
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/** Rotation within ±ROTATION_SNAP_DEG of upright becomes exactly 0. */
export function snapRotation(deg: number): number {
  const d = normalizeDeg(deg);
  return Math.abs(d) <= ROTATION_SNAP_DEG ? 0 : d;
}

/** A pinch that began with fingers closer than this has no usable scale or angle. */
const MIN_START_DISTANCE_PX = 12;

/**
 * The view for the fingers' current positions, worked out from where the pinch began (not step by step, so
 * nothing drifts): the sheet point that was under the starting midpoint stays under the current midpoint.
 * That is zoom about the midpoint, plus a pan by the midpoint's movement; the twist of the fingers rotates the sheet.
 *
 * The offset is returned unclamped: the caller keeps the sheet on screen (clampOffset).
 */
export function pinchView(start: PinchStart, a: Point, b: Point, stage: Size, limits: PinchLimits, rotate = true): View {
  const startDistance = distance(start.a, start.b);
  const usable = startDistance >= MIN_START_DISTANCE_PX;
  const rawZoom = usable ? start.view.zoom * (distance(a, b) / startDistance) : start.view.zoom;
  // Rounded here, before the offset is worked out, so the anchor holds for the numbers that are really stored.
  const zoom = Math.round(Math.min(limits.maxZoom, Math.max(limits.minZoom, rawZoom)) * 100) / 100;
  const twisted = start.view.rotationDeg + angleDeg(a, b) - angleDeg(start.a, start.b);
  const rotationDeg = rotate && usable ? Math.round(snapRotation(twisted) * 10) / 10 : start.view.rotationDeg;

  // Sheet point (mm) under the midpoint when the pinch began; it has to end up under the midpoint now.
  const anchor = screenToSheetMm(midpoint(start.a, start.b).x, midpoint(start.a, start.b).y, start.view, stage);
  const target = midpoint(a, b);
  const rad = (rotationDeg * Math.PI) / 180;
  const dx = (anchor.x - SHEET_MM.width / 2) * CSS_PX_PER_MM * zoom;
  const dy = (anchor.y - SHEET_MM.height / 2) * CSS_PX_PER_MM * zoom;
  return {
    zoom,
    rotationDeg,
    offsetX: target.x - stage.width / 2 - (Math.cos(rad) * dx - Math.sin(rad) * dy),
    offsetY: target.y - stage.height / 2 - (Math.sin(rad) * dx + Math.cos(rad) * dy),
  };
}
