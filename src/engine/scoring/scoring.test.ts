import { describe, expect, it } from "vitest";
import { TEXELS_PER_MM } from "../constants";
import { defaultPlacement, stencilSizeMm } from "../stencil";
import type { StencilPlacement } from "../types";
import { DeviationScorer, MeanTracker, OFF_STENCIL_MM, distanceToStencil } from "./deviation";
import type { StencilField } from "./deviation";
import { ScoreBook } from "./scoreBook";
import { HIGH_SHARE, MEDIUM_SHARE, overworkShare, sumCells, traumaLevelFromShare } from "./trauma";

/** A stencil with one vertical line down its middle: 80 mm wide, 120 mm tall. */
function verticalLine(): StencilField {
  const width = Math.round(80 * TEXELS_PER_MM);
  const height = Math.round(120 * TEXELS_PER_MM);
  const distanceMm = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) distanceMm[y * width + x] = Math.abs(x + 0.5 - width / 2) / TEXELS_PER_MM;
  }
  return { distanceMm, width, height, size: stencilSizeMm(width, height) };
}

const centred = defaultPlacement(); // the stencil's middle is at (100, 75) on the sheet
const hit = (x: number, y: number, cartridgeId = "rl-7") => ({ x, y, cartridgeId });
const liner = (id: string) => id.startsWith("rl");

describe("distanceToStencil", () => {
  const field = verticalLine();

  it("is about 0 on the line and grows with the distance from it", () => {
    expect(distanceToStencil(field, centred, 100, 75)).toBeLessThan(0.05);
    expect(distanceToStencil(field, centred, 101, 75)).toBeCloseTo(1, 1);
    expect(distanceToStencil(field, centred, 97, 60)).toBeCloseTo(3, 1);
    expect(distanceToStencil(field, centred, 100 - 20, 75)).toBeCloseTo(20, 1);
  });

  it("interpolates between texels instead of stepping", () => {
    const a = distanceToStencil(field, centred, 100.4, 75);
    const b = distanceToStencil(field, centred, 100.45, 75);
    expect(b - a).toBeCloseTo(0.05, 2);
  });

  it("follows the stencil when it is moved, rotated and scaled", () => {
    const moved: StencilPlacement = { centerXMm: 130, centerYMm: 90, rotationDeg: 0, scale: 1 };
    expect(distanceToStencil(field, moved, 130, 90)).toBeLessThan(0.05);
    expect(distanceToStencil(field, moved, 100, 75)).toBeCloseTo(30, 1);

    // turned a quarter: the line now runs across the sheet
    const turned: StencilPlacement = { centerXMm: 100, centerYMm: 75, rotationDeg: 90, scale: 1 };
    expect(distanceToStencil(field, turned, 60, 75)).toBeLessThan(0.05);
    expect(distanceToStencil(field, turned, 60, 78)).toBeCloseTo(3, 1);

    // half size: distances shrink with it
    const small: StencilPlacement = { centerXMm: 100, centerYMm: 75, rotationDeg: 0, scale: 0.5 };
    expect(distanceToStencil(field, small, 100, 75)).toBeLessThan(0.05);
    expect(distanceToStencil(field, small, 105, 75)).toBeCloseTo(5, 1);
    // ... which is what 10 mm of the unscaled stencil is
    expect(distanceToStencil(field, centred, 110, 75)).toBeCloseTo(10, 1);
  });

  it("measures beyond the stencil's edge by the way out, never as zero", () => {
    const edge = distanceToStencil(field, centred, 100 + 40, 75); // right at the raster's edge
    const beyond = distanceToStencil(field, centred, 100 + 50, 75);
    expect(beyond).toBeGreaterThan(edge + 9);
    expect(beyond).toBeCloseTo(50, 0);
    expect(distanceToStencil(field, centred, 100, 75 + 90)).toBeGreaterThan(29); // far above the stencil
  });
});

describe("DeviationScorer", () => {
  const make = () => {
    const s = new DeviationScorer(liner);
    s.setStencil(verticalLine(), centred);
    return s;
  };

  it("gives under 0.2 mm for a line traced exactly", () => {
    const s = make();
    const hits = Array.from({ length: 200 }, (_, i) => hit(100 + (i % 2 ? 0.05 : -0.05), 30 + i * 0.3));
    s.add(hits);
    expect(s.work.mean!).toBeLessThan(0.2);
  });

  it("gives about 1 mm for a line traced 1 mm beside it", () => {
    const s = make();
    s.add(Array.from({ length: 200 }, (_, i) => hit(101, 30 + i * 0.3)));
    expect(s.work.mean!).toBeCloseTo(1, 1);
    const left = make();
    left.add(Array.from({ length: 200 }, (_, i) => hit(99, 30 + i * 0.3)));
    expect(left.work.mean!).toBeCloseTo(1, 1);
  });

  it("is the mean over hits, so a wobbly trace scores its average wobble", () => {
    const s = make();
    s.add([hit(100.5, 60), hit(99.5, 61), hit(101.5, 62), hit(98.5, 63)]);
    expect(s.work.mean!).toBeCloseTo((0.5 + 0.5 + 1.5 + 1.5) / 4, 1);
  });

  it("ignores hits more than 3 mm from a line: shading does not dilute the score", () => {
    const s = make();
    s.add(Array.from({ length: 50 }, (_, i) => hit(100.4, 30 + i)));
    const before = s.work.mean!;
    const far = s.add(Array.from({ length: 500 }, (_, i) => hit(100 + OFF_STENCIL_MM + 0.5 + (i % 5), 30 + (i % 50))));
    expect(s.work.mean!).toBeCloseTo(before, 9);
    expect(s.work.samples).toBe(50);
    expect(far.every((d) => d > OFF_STENCIL_MM)).toBe(true); // still reported, for the heatmap
  });

  it("counts a hit exactly at the limit", () => {
    const s = make();
    s.add([hit(100 + OFF_STENCIL_MM - 0.01, 70)]);
    expect(s.work.samples).toBe(1);
  });

  it("scores liners only: shading with a magnum changes nothing", () => {
    const s = make();
    s.add(Array.from({ length: 50 }, (_, i) => hit(100.2, 30 + i)));
    const before = s.work.mean;
    // a magnum working right on the line, and just beside it
    const marked = s.add([...Array.from({ length: 300 }, (_, i) => hit(100.9, 30 + (i % 50), "m1-7")), ...Array.from({ length: 100 }, () => hit(100, 70, "rm-15"))]);
    expect(s.work.mean).toBeCloseTo(before!, 9);
    expect(s.work.samples).toBe(50);
    expect(marked.every((d) => Number.isFinite(d))).toBe(true);
  });

  it("scores nothing, and reports NaN, without a stencil", () => {
    const s = new DeviationScorer(liner);
    const d = s.add([hit(100, 75)]);
    expect(Number.isNaN(d[0])).toBe(true);
    expect(s.work.mean).toBeNull();
  });

  it("keeps the work and the session apart", () => {
    const s = make();
    s.add(Array.from({ length: 10 }, () => hit(101, 70)));
    s.session.reset();
    s.add(Array.from({ length: 10 }, () => hit(102, 70)));
    expect(s.session.mean!).toBeCloseTo(2, 1);
    expect(s.work.mean!).toBeCloseTo(1.5, 1);
  });

  it("follows a moved stencil, which is how it is placed before the first stroke", () => {
    const s = make();
    s.setPlacement({ centerXMm: 120, centerYMm: 75, rotationDeg: 0, scale: 1 });
    s.add([hit(120, 70)]);
    expect(s.work.mean!).toBeLessThan(0.05);
  });
});

describe("MeanTracker", () => {
  it("is null until it has a value", () => {
    const t = new MeanTracker();
    expect(t.mean).toBeNull();
    t.add(2);
    t.add(4);
    expect(t.mean).toBe(3);
    t.reset();
    expect(t.mean).toBeNull();
  });
});

describe("trauma level", () => {
  it("is low below 5%, medium from 5% to 15%, high above (ENGINE.md §8)", () => {
    expect(traumaLevelFromShare(0)).toBe("low");
    expect(traumaLevelFromShare(0.049)).toBe("low");
    expect(traumaLevelFromShare(MEDIUM_SHARE)).toBe("medium");
    expect(traumaLevelFromShare(0.1)).toBe("medium");
    expect(traumaLevelFromShare(HIGH_SHARE)).toBe("medium");
    expect(traumaLevelFromShare(0.151)).toBe("high");
    expect(traumaLevelFromShare(1)).toBe("high");
  });

  it("sums the reduction's cells and takes the overworked share of the inked area", () => {
    // two cells, RGBA each: 400 inked / 40 overworked, and 600 inked / 110 overworked
    const r = sumCells([400, 40, 0, 1, 600, 110, 0, 1]);
    expect(r).toEqual({ inkedTexels: 1000, overworkedTexels: 150 });
    expect(overworkShare(r)).toBeCloseTo(0.15, 9);
    expect(traumaLevelFromShare(overworkShare(r))).toBe("medium");
  });

  it("is low when nothing is inked, however worked the skin is", () => {
    expect(overworkShare({ inkedTexels: 0, overworkedTexels: 0 })).toBe(0);
    expect(traumaLevelFromShare(overworkShare(sumCells(new Array(48).fill(0))))).toBe("low");
  });
});

describe("ScoreBook", () => {
  const make = () => {
    const deviation = new DeviationScorer(liner);
    deviation.setStencil(verticalLine(), centred);
    return { deviation, book: new ScoreBook(deviation) };
  };

  it("reports strokes as passes, with deviation and trauma level", () => {
    const { deviation, book } = make();
    expect(book.work(0)).toEqual({ passes: 0, deviationMm: null, traumaLevel: "low" });
    deviation.add([hit(101, 70)]);
    book.setTraumaLevel("high");
    expect(book.work(5)).toEqual({ passes: 5, deviationMm: expect.closeTo(1, 1), traumaLevel: "high" });
  });

  it("counts a session from where it started", () => {
    const { deviation, book } = make();
    deviation.add([hit(101, 70)]);
    book.startSession(4);
    deviation.add([hit(102, 70)]);
    const s = book.session(9);
    expect(s.passes).toBe(5);
    expect(s.deviationMm!).toBeCloseTo(2, 1);
    expect(book.work(9).passes).toBe(9);
    expect(book.session(2).passes).toBe(0); // never negative, even after an undo
  });
});

describe("taking an undone stroke back out of the scores", () => {
  it("MeanTracker.remove undoes an add, and empties cleanly", () => {
    const m = new MeanTracker();
    m.add(1);
    m.add(3);
    m.remove(3, 1);
    expect(m.mean).toBe(1);
    m.remove(1, 1);
    expect(m.mean).toBeNull();
    m.add(2);
    expect(m.mean).toBe(2); // no residue from the earlier values
  });

  it("DeviationScorer reports what each add counted, and removeStroke subtracts it", () => {
    const deviation = new DeviationScorer(() => true);
    deviation.setStencil(verticalLine(), defaultPlacement());
    const line = { x: 100, y: 75, cartridgeId: "rl-7" };
    deviation.add([line]);
    deviation.add([{ ...line, x: 101 }, { ...line, x: 140 }]); // 1 mm away counts, 40 mm away is off-stencil
    expect(deviation.lastAdded.count).toBe(1);
    expect(deviation.lastAdded.sum).toBeCloseTo(1, 1);
    const { sum, count } = deviation.lastAdded;
    deviation.removeStroke(sum, count, true);
    expect(deviation.work.mean).toBeCloseTo(0, 1);
    expect(deviation.session.mean).toBeCloseTo(0, 1);
  });

  it("a stroke from before the session leaves the session mean alone", () => {
    const deviation = new DeviationScorer(() => true);
    deviation.setStencil(verticalLine(), defaultPlacement());
    deviation.add([{ x: 101, y: 75, cartridgeId: "rl-7" }]);
    deviation.session.reset(); // the session started after that stroke
    deviation.add([{ x: 100, y: 75, cartridgeId: "rl-7" }]);
    deviation.removeStroke(1, 1, false);
    expect(deviation.session.mean).toBeCloseTo(0, 1);
    expect(deviation.work.mean).toBeCloseTo(0, 1);
  });

  it("ScoreBook: a session cannot start after the last stroke that is left", () => {
    const book = new ScoreBook(new DeviationScorer(() => true));
    book.startSession(5);
    book.clampSession(3);
    expect(book.sessionStart).toBe(3);
    expect(book.session(4).passes).toBe(1);
    book.clampSession(10);
    expect(book.sessionStart).toBe(3);
  });
});

describe("saved deviation", () => {
  it("MeanTracker.set restores a saved sum and count", () => {
    const m = new MeanTracker();
    m.add(5);
    m.set(6, 4);
    expect(m.total).toBe(6);
    expect(m.samples).toBe(4);
    expect(m.mean).toBe(1.5);
    m.add(2);
    expect(m.mean).toBeCloseTo(8 / 5);
  });
});
