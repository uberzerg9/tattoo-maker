import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { TEXELS_PER_MM } from "../engine/constants";
import { NO_LINE_DISTANCE_MM, buildStencil, rgbaToGray } from "./stencilPipeline";
import type { CV, StencilParams } from "./stencilPipeline";

// Loaded with require: vitest's ESM interop would await the library's thenable export and fail.
const nodeRequire = createRequire(import.meta.url);

let cv: CV;
beforeAll(async () => {
  const mod = nodeRequire("@techstark/opencv-js");
  cv = mod instanceof Promise ? await mod : mod;
}, 60_000);

// --- tiny drawing kit: a sketch is a grey image, 255 = paper -----------------------------

interface Img {
  w: number;
  h: number;
  d: Uint8Array;
}
const blank = (w: number, h: number): Img => ({ w, h, d: new Uint8Array(w * h).fill(255) });
const ink = (img: Img, x: number, y: number, v: number) => {
  if (x >= 0 && y >= 0 && x < img.w && y < img.h) img.d[y * img.w + x] = Math.min(img.d[y * img.w + x]!, v);
};

function segment(img: Img, x0: number, y0: number, x1: number, y1: number, thick: number, v: number) {
  const r = thick / 2;
  const minX = Math.floor(Math.min(x0, x1) - r - 1), maxX = Math.ceil(Math.max(x0, x1) + r + 1);
  const minY = Math.floor(Math.min(y0, y1) - r - 1), maxY = Math.ceil(Math.max(y0, y1) + r + 1);
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
      if (Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) <= r) ink(img, x, y, v);
    }
  }
}

function ring(img: Img, cx: number, cy: number, radius: number, thick: number, v: number) {
  const n = 360;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    segment(img, cx + radius * Math.cos(a0), cy + radius * Math.sin(a0), cx + radius * Math.cos(a1), cy + radius * Math.sin(a1), thick, v);
  }
}

function fill(img: Img, x0: number, y0: number, x1: number, y1: number, v: number) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) ink(img, x, y, v);
}

/** Diagonal pencil hatching: thin lines close together. */
function hatch(img: Img, x0: number, y0: number, x1: number, y1: number, spacing: number, thick: number, v: number) {
  for (let k = -(y1 - y0); k < x1 - x0; k += spacing) {
    for (let y = y0; y < y1; y++) {
      const x = x0 + k + (y - y0);
      for (let t = 0; t < thick; t++) if (x + t >= x0 && x + t < x1) ink(img, x + t, y, v);
    }
  }
}

const params = (over: Partial<StencilParams> = {}): StencilParams => ({
  threshold: 140,
  lineWeightPx: 2.5,
  removeFills: true,
  heightMm: 100,
  texelsPerMm: TEXELS_PER_MM,
  withDistance: true,
  ...over,
});
const run = (img: Img, over: Partial<StencilParams> = {}) =>
  buildStencil(cv, { data: img.d, width: img.w, height: img.h }, params(over));

const count = (m: Uint8Array, width: number, x0: number, y0: number, x1: number, y1: number) => {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (m[y * width + x]) n++;
  return n;
};

/** A flower: five overlapping petal outlines round a centre, and a stem. Lines cross near the middle. */
function flower(): Img {
  const img = blank(600, 800);
  segment(img, 300, 100, 300, 740, 4, 34);
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 * Math.PI) / 180;
    let px = 0;
    let py = 0;
    for (let k = 0; k <= 90; k++) {
      const t = (k / 90) * Math.PI * 2;
      const ex = 38 * Math.cos(t);
      const ey = -60 + 62 * Math.sin(t);
      const x = 300 + ex * Math.cos(a) - ey * Math.sin(a);
      const y = 200 + ex * Math.sin(a) + ey * Math.cos(a);
      if (k) segment(img, px, py, x, y, 4, 34);
      px = x;
      py = y;
    }
  }
  return img;
}

/** A clean outline sketch: a ring of radius 300 px on a 1000 px page, drawn in a firm pencil. */
const cleanRing = () => {
  const img = blank(1000, 1000);
  ring(img, 500, 500, 300, 3, 40);
  return img;
};

describe("a clean line sketch", () => {
  let r: ReturnType<typeof run>;
  let cx = 0;
  let cy = 0;
  let ringTexels = 0;
  beforeAll(() => {
    r = run(cleanRing());
    cx = r.width / 2;
    cy = r.height / 2;
    ringTexels = 300 * (r.width / 1000);
  });

  it("becomes crisp lines: every texel is fully on or fully off", () => {
    expect(new Set(r.mask)).toEqual(new Set([0, 255]));
  });

  it("covers the ring and nothing else", () => {
    const circumference = 2 * Math.PI * ringTexels;
    const weightTexels = 9; // 2.5 px at 3.2 px/mm and 10.24 texels/mm, rounded up to an odd width
    const on = r.mask.reduce((n, v) => n + (v ? 1 : 0), 0);
    expect(on).toBeGreaterThan(circumference * weightTexels * 0.75);
    expect(on).toBeLessThan(circumference * weightTexels * 1.25);
    expect(count(r.mask, r.width, 0, 0, r.width, 40)).toBe(0); // the paper corner is empty
  });

  it("draws every line at the requested weight", () => {
    // a horizontal cut through the left side of the ring
    const row = Math.round(cy);
    const x = Math.round(cx - ringTexels);
    let left = x;
    let right = x;
    while (r.mask[row * r.width + left - 1]) left--;
    while (r.mask[row * r.width + right + 1]) right++;
    expect(right - left + 1).toBeGreaterThanOrEqual(8);
    expect(right - left + 1).toBeLessThanOrEqual(10);
  });

  it("measures distance from the line centres, in mm", () => {
    const df = r.distanceMm!;
    const at = (x: number, y: number) => df[Math.round(y) * r.width + Math.round(x)]!;
    const row = cy;
    expect(at(cx - ringTexels, row)).toBeLessThan(0.1); // on the line: about 0
    expect(at(cx - ringTexels + TEXELS_PER_MM, row)).toBeCloseTo(1, 1); // 1 mm inside
    expect(at(cx - ringTexels - 3 * TEXELS_PER_MM, row)).toBeCloseTo(3, 1); // 3 mm outside
    expect(at(cx, cy)).toBeCloseTo(ringTexels / TEXELS_PER_MM, 0); // the middle of the ring
  });

  it("keeps the distance at the edge of the drawn line as large as half its width", () => {
    // the field is measured from the centre line, not the line's edge: a hit at the edge is
    // still 0.4 mm off the line, and the stencil's own weight does not hide that
    const df = r.distanceMm!;
    const row = Math.round(cy);
    const x = Math.round(cx - ringTexels);
    let edge = x;
    while (r.mask[row * r.width + edge - 1]) edge--;
    expect(df[row * r.width + edge]!).toBeGreaterThan(0.3);
    expect(df[row * r.width + edge]!).toBeLessThan(0.5);
  });

  it("maps the sketch to the requested size on the skin", () => {
    expect(r.heightMm).toBeCloseTo(100, 0);
    expect(r.widthMm).toBeCloseTo(100, 0);
    const wide = run(blank(1000, 500), { heightMm: 50 });
    expect(wide.height).toBe(Math.round(50 * TEXELS_PER_MM));
    expect(wide.width).toBe(2 * wide.height);
    expect(wide.widthMm / wide.heightMm).toBeCloseTo(2, 2);
  });
});

describe("a sketch with shading", () => {
  const sketch = () => {
    const img = blank(1000, 1000);
    ring(img, 500, 500, 150, 3, 40); // outline
    fill(img, 700, 100, 900, 300, 90); // a pencilled-in area
    hatch(img, 100, 700, 300, 900, 8, 2, 100); // close pencil hatching
    return img;
  };
  let on: ReturnType<typeof run>;
  let off: ReturnType<typeof run>;
  let s = 1;
  beforeAll(() => {
    on = run(sketch(), { removeFills: false });
    off = run(sketch(), { removeFills: true });
    s = on.width / 1000;
  });
  const box = (x0: number, y0: number, x1: number, y1: number) =>
    [Math.round(x0 * s), Math.round(y0 * s), Math.round(x1 * s), Math.round(y1 * s)] as const;

  it("keeps the shading when fills are not removed", () => {
    const [x0, y0, x1, y1] = box(700, 100, 900, 300);
    expect(count(on.mask, on.width, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0))).toBeGreaterThan(0.8);
    const [h0, k0, h1, k1] = box(100, 700, 300, 900);
    expect(count(on.mask, on.width, h0, k0, h1, k1) / ((h1 - h0) * (k1 - k0))).toBeGreaterThan(0.15);
  });

  it("loses the shading when 'Remove fills and shading' is on", () => {
    const [x0, y0, x1, y1] = box(700, 100, 900, 300);
    expect(count(off.mask, off.width, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0))).toBeLessThan(0.02);
    const [h0, k0, h1, k1] = box(100, 700, 300, 900);
    expect(count(off.mask, off.width, h0, k0, h1, k1) / ((h1 - h0) * (k1 - k0))).toBeLessThan(0.02);
  });

  it("removes looser hatching too, but not a double contour", () => {
    const img = blank(1000, 1000);
    ring(img, 500, 500, 150, 3, 40);
    hatch(img, 100, 650, 400, 950, 16, 2, 100); // a 3 cm patch of lines 1.6 mm apart
    ring(img, 500, 500, 165, 3, 40); // a second contour 1.5 mm outside the first
    const r = run(img, { removeFills: true });
    const sc = r.width / 1000;
    const [h0, k0, h1, k1] = [100, 650, 400, 950].map((v) => Math.round(v * sc)) as [number, number, number, number];
    // the loose patch goes too, bar a few fragments at its edges (it was over half covered)
    expect(count(r.mask, r.width, h0, k0, h1, k1) / ((h1 - h0) * (k1 - k0))).toBeLessThan(0.08);
    // both contours survive: the ring area holds clearly more than a single outline would
    const single = run(cleanRing(), { removeFills: true });
    expect(single.mask.some((v) => v)).toBe(true);
    const [a0, a1] = [330, 670].map((v) => Math.round(v * sc)) as [number, number];
    expect(count(r.mask, r.width, a0, a0, a1, a1)).toBeGreaterThan(2 * 2 * Math.PI * 150 * sc * 6);
  });

  it("keeps a crowded junction of outlines: it is not shading", () => {
    // five petals cross within a few millimetres of the centre of the flower
    for (const texelsPerMm of [2.56, 5.12, TEXELS_PER_MM]) {
      const r = run(flower(), { heightMm: 120, texelsPerMm, withDistance: false });
      const f = r.width / 600;
      const [x0, y0, x1, y1] = [240, 150, 360, 250].map((v) => Math.round(v * f)) as [number, number, number, number];
      const share = count(r.mask, r.width, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0));
      expect(share, `at ${texelsPerMm} texels/mm`).toBeGreaterThan(0.08);
    }
  });

  it("keeps the whole flower outline: the final stencil is as complete as the preview", () => {
    const share = (texelsPerMm: number) => {
      const r = run(flower(), { heightMm: 120, texelsPerMm, withDistance: false });
      return r.mask.reduce((n, v) => n + (v ? 1 : 0), 0) / r.mask.length;
    };
    const preview = share(5.12);
    const final = share(TEXELS_PER_MM);
    expect(final / preview).toBeGreaterThan(0.7);
    expect(final / preview).toBeLessThan(1.4);
  });

  it("still keeps the outline when the shading goes", () => {
    const [x0, y0, x1, y1] = box(340, 340, 660, 660);
    const withShading = count(on.mask, on.width, x0, y0, x1, y1);
    const without = count(off.mask, off.width, x0, y0, x1, y1);
    expect(without).toBeGreaterThan(withShading * 0.9);
    expect(without).toBeGreaterThan(5000);
  });

  it("measures distance to the outline only once the shading is removed", () => {
    const [x0, y0] = box(800, 200, 801, 201); // the middle of the pencilled-in area
    expect(off.distanceMm![y0 * off.width + x0]!).toBeGreaterThan(10); // far from the ring: it is gone
    // with fills kept they are drawn, so they count as lines too
    expect(on.distanceMm![y0 * on.width + x0]!).toBeLessThan(2);
  });
});

describe("controls", () => {
  it("a higher threshold keeps less: faint lines drop out first", () => {
    const img = blank(1000, 1000);
    segment(img, 100, 300, 900, 300, 3, 40); // firm line
    segment(img, 100, 600, 900, 600, 3, 150); // faint line
    const area = (t: number, removeFills: boolean) =>
      run(img, { threshold: t, removeFills }).mask.reduce((n, v) => n + (v ? 1 : 0), 0);
    for (const removeFills of [true, false]) {
      const low = area(60, removeFills);
      const mid = area(140, removeFills);
      const high = area(230, removeFills);
      expect(low).toBeGreaterThan(mid * 1.5); // both lines at 60, only the firm one at 140
      expect(mid).toBeGreaterThan(0);
      expect(high).toBe(0); // nothing is dark enough
    }
  });

  it("a larger line weight draws thicker lines", () => {
    const img = cleanRing();
    const area = (w: number) => run(img, { lineWeightPx: w, withDistance: false }).mask.reduce((n, v) => n + (v ? 1 : 0), 0);
    const [a, b, c, d] = [1, 2.5, 4, 6].map(area);
    expect(a!).toBeLessThan(b!);
    expect(b!).toBeLessThan(c!);
    expect(c!).toBeLessThan(d!);
    expect(d! / a!).toBeGreaterThan(3);
  });

  it("makes thick marker lines the same weight as thin pencil ones", () => {
    const thin = blank(1000, 1000);
    const thick = blank(1000, 1000);
    segment(thin, 100, 500, 900, 500, 2, 40);
    segment(thick, 100, 500, 900, 500, 9, 40);
    const a = run(thin, { withDistance: false });
    const b = run(thick, { withDistance: false });
    const on = (r: typeof a) => r.mask.reduce((n, v) => n + (v ? 1 : 0), 0);
    expect(on(b) / on(a)).toBeGreaterThan(0.85);
    expect(on(b) / on(a)).toBeLessThan(1.15);
  });

  it("drops dust but keeps real lines", () => {
    const img = blank(1000, 1000);
    for (let i = 0; i < 40; i++) fill(img, 50 + i * 20, 50, 52 + i * 20, 52, 0); // 2 px specks
    segment(img, 100, 500, 900, 500, 3, 40);
    const r = run(img);
    expect(count(r.mask, r.width, 0, 0, r.width, Math.round(120 * (r.width / 1000)))).toBe(0);
    expect(count(r.mask, r.width, 0, Math.round(480 * (r.width / 1000)), r.width, Math.round(520 * (r.width / 1000)))).toBeGreaterThan(5000);
  });

  it("treats a transparent background as paper", () => {
    const n = 400;
    const rgba = new Uint8ClampedArray(n * n * 4); // fully transparent
    for (let x = 40; x < 360; x++) for (let y = 198; y < 202; y++) rgba.set([20, 20, 20, 255], (y * n + x) * 4);
    const gray = rgbaToGray(rgba, n, n);
    expect(gray[0]).toBe(255);
    expect(gray[200 * n + 200]).toBeLessThan(40);
    const r = buildStencil(cv, { data: gray, width: n, height: n }, params({ heightMm: 40 }));
    expect(r.mask.some((v) => v)).toBe(true);
    expect(r.mask[0]).toBe(0);
  });

  it("handles a blank page without lines", () => {
    const r = run(blank(500, 500), { heightMm: 40 });
    expect(r.mask.every((v) => v === 0)).toBe(true);
    expect(r.distanceMm!.every((v) => v === NO_LINE_DISTANCE_MM)).toBe(true);
  });

  it("skips the distance field for previews", () => {
    expect(run(cleanRing(), { withDistance: false, texelsPerMm: 2.56 }).distanceMm).toBeNull();
  });

  it("works at preview resolution too, with the same shape", () => {
    const full = run(cleanRing(), { withDistance: false });
    const preview = run(cleanRing(), { withDistance: false, texelsPerMm: 2.56 });
    const frac = (r: typeof full) => r.mask.reduce((n, v) => n + (v ? 1 : 0), 0) / r.mask.length;
    expect(frac(preview)).toBeGreaterThan(frac(full) * 0.7);
    expect(frac(preview)).toBeLessThan(frac(full) * 1.3);
  });
});

describe("memory", () => {
  it("frees every matrix: the WASM heap does not grow across runs", { timeout: 120_000 }, () => {
    const heap = () => (cv as unknown as { HEAPU8?: Uint8Array }).HEAPU8?.length;
    const img = cleanRing();
    for (let i = 0; i < 4; i++) run(img, { withDistance: true });
    const before = heap();
    for (let i = 0; i < 25; i++) run(img, { withDistance: true });
    const after = heap();
    if (before !== undefined) expect(after).toBe(before);
    expect(typeof before === "number" || before === undefined).toBe(true);
  });
});
