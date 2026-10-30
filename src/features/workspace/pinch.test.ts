import { describe, expect, it } from "vitest";
import { sheetMmToScreen, screenToSheetMm } from "../../engine/view";
import type { Point, Size, View } from "../../engine/view";
import { ROTATION_SNAP_DEG, normalizeDeg, pinchView, snapRotation } from "./pinch";
import type { PinchStart } from "./pinch";

const stage: Size = { width: 1280, height: 800 };
const limits = { minZoom: 0.5, maxZoom: 4 };
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** The sheet point (mm) under a screen point, in a view. */
const under = (p: Point, view: View) => screenToSheetMm(p.x, p.y, view, stage);

function start(view: View, a: Point, b: Point): PinchStart {
  return { view, a, b };
}

describe("pinchView", () => {
  const view: View = { zoom: 1.5, offsetX: 40, offsetY: -25, rotationDeg: 20 };
  const a0 = { x: 500, y: 400 };
  const b0 = { x: 700, y: 430 };

  it("keeps the sheet point under the fingers' midpoint under the midpoint, whatever the fingers do", () => {
    const s = start(view, a0, b0);
    const anchor = under(mid(a0, b0), view);
    const moves: [Point, Point][] = [
      [{ x: 450, y: 380 }, { x: 760, y: 460 }], // spread and drift
      [{ x: 560, y: 410 }, { x: 640, y: 420 }], // squeeze
      [{ x: 300, y: 600 }, { x: 600, y: 700 }], // move and twist
      [{ x: 520, y: 400 }, { x: 720, y: 430 }], // slide only
    ];
    for (const [a, b] of moves) {
      const next = pinchView(s, a, b, stage, limits);
      const at = sheetMmToScreen(anchor.x, anchor.y, next, stage);
      const target = mid(a, b);
      expect(Math.hypot(at.x - target.x, at.y - target.y)).toBeLessThan(1e-6);
    }
  });

  it("scales the zoom by the ratio of the finger distances", () => {
    const s = start(view, a0, b0);
    const a = { x: 400, y: 385 };
    const b = { x: 800, y: 445 }; // fingers twice as far apart, same direction (a0 → b0 is (200, 30))
    const next = pinchView(s, a, b, stage, limits);
    expect(next.zoom).toBeCloseTo(view.zoom * (dist(a, b) / dist(a0, b0)), 2); // rounded to 0.01
    expect(next.rotationDeg).toBeCloseTo(view.rotationDeg, 1); // direction unchanged: no twist (kept to 0.1°)
  });

  it("holds the anchor for any start view and any finger positions", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      const v: View = { zoom: 0.5 + rnd() * 3.5, offsetX: (rnd() - 0.5) * 600, offsetY: (rnd() - 0.5) * 400, rotationDeg: (rnd() - 0.5) * 360 };
      const a = { x: rnd() * 1280, y: rnd() * 800 };
      const b = { x: rnd() * 1280, y: rnd() * 800 };
      if (dist(a, b) < 40) continue;
      const s = start(v, a, b);
      const anchor = under(mid(a, b), v);
      const na = { x: rnd() * 1280, y: rnd() * 800 };
      const nb = { x: rnd() * 1280, y: rnd() * 800 };
      const next = pinchView(s, na, nb, stage, limits);
      const at = sheetMmToScreen(anchor.x, anchor.y, next, stage);
      const target = mid(na, nb);
      expect(Math.hypot(at.x - target.x, at.y - target.y)).toBeLessThan(1e-5);
    }
  });

  it("stops at the zoom limits and still keeps the anchor under the midpoint", () => {
    const s = start({ ...view, rotationDeg: 0 }, a0, b0);
    const anchor = under(mid(a0, b0), s.view);
    const wide = pinchView(s, { x: 0, y: 400 }, { x: 1280, y: 430 }, stage, limits); // 6× apart
    expect(wide.zoom).toBe(limits.maxZoom);
    const tight = pinchView(s, { x: 600, y: 400 }, { x: 610, y: 400 }, stage, limits);
    expect(tight.zoom).toBe(limits.minZoom);
    for (const [next, a, b] of [[wide, { x: 0, y: 400 }, { x: 1280, y: 430 }], [tight, { x: 600, y: 400 }, { x: 610, y: 400 }]] as const) {
      const at = sheetMmToScreen(anchor.x, anchor.y, next, stage);
      const target = mid(a, b);
      expect(Math.hypot(at.x - target.x, at.y - target.y)).toBeLessThan(1e-6);
    }
  });

  it("pans by the midpoint's movement when the fingers keep their distance and direction", () => {
    const s = start(view, a0, b0);
    const next = pinchView(s, { x: a0.x + 120, y: a0.y - 60 }, { x: b0.x + 120, y: b0.y - 60 }, stage, limits);
    expect(next.zoom).toBeCloseTo(view.zoom, 2);
    expect(next.rotationDeg).toBeCloseTo(view.rotationDeg, 1);
    expect(next.offsetX).toBeCloseTo(view.offsetX + 120, 0);
    expect(next.offsetY).toBeCloseTo(view.offsetY - 60, 0);
  });

  it("turns the sheet with the twist of the fingers, clockwise being positive", () => {
    const upright: View = { zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const a = { x: 600, y: 400 };
    const b = { x: 800, y: 400 };
    const s = start(upright, a, b);
    // Rotate the finger pair 40° clockwise on screen (y points down) about its midpoint.
    const turn = (deg: number): [Point, Point] => {
      const c = mid(a, b);
      const r = (deg * Math.PI) / 180;
      const rot = (p: Point): Point => ({ x: c.x + Math.cos(r) * (p.x - c.x) - Math.sin(r) * (p.y - c.y), y: c.y + Math.sin(r) * (p.x - c.x) + Math.cos(r) * (p.y - c.y) });
      return [rot(a), rot(b)];
    };
    const [na, nb] = turn(40);
    expect(pinchView(s, na, nb, stage, limits).rotationDeg).toBeCloseTo(40, 1);
    const [ca, cb] = turn(-25);
    expect(pinchView(s, ca, cb, stage, limits).rotationDeg).toBeCloseTo(-25, 1);
  });

  it("can ignore the twist", () => {
    const s = start({ ...view, rotationDeg: 10 }, a0, b0);
    const next = pinchView(s, { x: 500, y: 400 }, { x: 600, y: 600 }, stage, limits, false);
    expect(next.rotationDeg).toBe(10);
  });

  it("snaps to upright within ±3° but not beyond", () => {
    const upright: View = { zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const a = { x: 600, y: 400 };
    const s = start(upright, a, { x: 800, y: 400 });
    const tilted = (deg: number) => {
      const r = (deg * Math.PI) / 180;
      return { x: a.x + Math.cos(r) * 200, y: a.y + Math.sin(r) * 200 };
    };
    expect(pinchView(s, a, tilted(2.5), stage, limits).rotationDeg).toBe(0);
    expect(pinchView(s, a, tilted(-2.9), stage, limits).rotationDeg).toBe(0);
    expect(pinchView(s, a, tilted(3.5), stage, limits).rotationDeg).toBeCloseTo(3.5, 1);
    // a sheet that was already tilted snaps back to upright when twisted onto it
    const s2 = start({ ...upright, rotationDeg: 30 }, a, { x: 800, y: 400 });
    expect(pinchView(s2, a, tilted(-28), stage, limits).rotationDeg).toBe(0);
  });

  it("ignores scale and twist when the fingers started on top of each other", () => {
    const s = start(view, { x: 500, y: 400 }, { x: 503, y: 400 });
    const next = pinchView(s, { x: 400, y: 400 }, { x: 800, y: 500 }, stage, limits);
    expect(next.zoom).toBe(view.zoom);
    expect(next.rotationDeg).toBe(view.rotationDeg);
  });
});

describe("rotation helpers", () => {
  it("normalises into (-180, 180]", () => {
    expect(normalizeDeg(190)).toBe(-170);
    expect(normalizeDeg(-190)).toBe(170);
    expect(normalizeDeg(720)).toBe(0);
    expect(normalizeDeg(180)).toBe(180);
  });

  it("snaps only inside the window", () => {
    expect(ROTATION_SNAP_DEG).toBe(3);
    expect(snapRotation(3)).toBe(0);
    expect(snapRotation(-3)).toBe(0);
    expect(snapRotation(3.01)).toBeCloseTo(3.01, 9);
    expect(snapRotation(357)).toBe(0); // 357° is -3°
  });
});
