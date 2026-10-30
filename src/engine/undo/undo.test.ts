import { describe, expect, it } from "vitest";
import type { Hit } from "../hit";
import { CHECKPOINTS_KEPT, CHECKPOINT_EVERY, UndoHistory } from "./history";
import { BYTES_PER_HIT, normalizeHit, packHits, unpackHits } from "./packedHits";

const hit = (i: number): Hit => ({
  x: 10.123456789 + i,
  y: 20.987654321 - i,
  t: 1234.5678 + i,
  speed: 33.3333333,
  depth: 0.5,
  angle: Math.PI / 7,
  cartridgeId: i % 2 ? "rm-15" : "rl-7",
  inkTone: 0.4,
  inkLevel: 0.123456789,
  seed: 0xfedcba98 - i,
});

const supply = { caps: {}, needles: {} };

/** Draws `n` more strokes; each one's checkpoint payload is its stroke count. */
function draw(history: UndoHistory<number>, n: number): number[] {
  const freed: number[] = [];
  for (let i = 0; i < n; i++) {
    history.begin({ id: history.total + 1, logStart: 0, supplyBefore: supply });
    history.add([normalizeHit(hit(i))], 1, 1);
    if (history.end()) {
      for (const c of history.addCheckpoint(history.total)) if (c.payload !== null) freed.push(c.payload);
    }
  }
  return freed;
}

describe("packed hits", () => {
  it("takes 40 bytes a hit", () => {
    expect(packHits([hit(0), hit(1)]).buffer.byteLength).toBe(2 * BYTES_PER_HIT);
    expect(BYTES_PER_HIT).toBe(40);
  });

  it("gives back exactly what was normalised, seed and cartridge included", () => {
    const hits = [0, 1, 2, 3].map((i) => normalizeHit(hit(i)));
    expect(unpackHits(packHits(hits))).toEqual(hits);
  });

  it("keeps full 32-bit seeds", () => {
    const h = normalizeHit({ ...hit(0), seed: 0xffffffff });
    expect(unpackHits(packHits([h]))[0]!.seed).toBe(0xffffffff);
  });

  it("normalising is idempotent", () => {
    const once = normalizeHit(hit(3));
    expect(normalizeHit({ ...once })).toEqual(once);
  });
});

describe("UndoHistory", () => {
  it("has nothing to undo at first", () => {
    const h = new UndoHistory<number>();
    expect(h.steps).toBe(0);
    expect(h.undo()).toBeNull();
  });

  it("restarts from the blank sheet and replays the strokes before the target", () => {
    const h = new UndoHistory<number>();
    draw(h, 5);
    const plan = h.undo()!;
    expect(h.total).toBe(4);
    expect(plan.base).toEqual({ strokes: 0, payload: null });
    expect(plan.replay.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(plan.removed.index).toBe(4);
  });

  it("restarts from the nearest checkpoint at or before the target", () => {
    const h = new UndoHistory<number>();
    draw(h, 35);
    // 35 -> 34 ... -> 30: the checkpoint at 30 is still valid, nothing to replay
    for (let i = 0; i < 5; i++) h.undo();
    const at30 = h.undo()!; // 30 -> 29: the checkpoint at 30 is gone, use 20 and replay 9
    expect(at30.dropped.map((c) => c.strokes)).toEqual([30]);
    expect(at30.base.strokes).toBe(20);
    expect(at30.replay).toHaveLength(9);
  });

  it("draw 35, undo 30: back at stroke 5 from the blank sheet plus 5 strokes", () => {
    const h = new UndoHistory<number>();
    draw(h, 35);
    let last: ReturnType<typeof h.undo> = null;
    for (let i = 0; i < 30; i++) last = h.undo();
    expect(h.total).toBe(5);
    expect(last!.base).toEqual({ strokes: 0, payload: null });
    expect(last!.replay.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("always offers at least 30 steps once enough has been drawn", () => {
    const h = new UndoHistory<number>();
    for (let n = 1; n <= 250; n++) {
      draw(h, 1);
      expect(h.steps).toBeGreaterThanOrEqual(Math.min(n, 30));
    }
  });

  it("stays bounded: few checkpoints, and only strokes that can still be undone", () => {
    const h = new UndoHistory<number>();
    const freed = draw(h, 300);
    expect(h.checkpointCount).toBeLessThanOrEqual(CHECKPOINTS_KEPT);
    expect(h.retainedStrokes).toBeLessThanOrEqual(CHECKPOINTS_KEPT * CHECKPOINT_EVERY);
    expect(h.retainedHits).toBe(h.retainedStrokes);
    expect(freed.length).toBeGreaterThan(20); // evicted payloads are handed back for reuse
  });

  it("can undo every step it offers, down to the oldest checkpoint", () => {
    const h = new UndoHistory<number>();
    draw(h, 120);
    const steps = h.steps;
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(steps);
    expect(h.total).toBe(120 - steps);
    expect(h.steps).toBe(0);
  });

  it("takes a new checkpoint when drawing again after an undo", () => {
    const h = new UndoHistory<number>();
    draw(h, 32);
    for (let i = 0; i < 5; i++) h.undo(); // 27
    draw(h, 3); // 30 again
    expect(h.total).toBe(30);
    expect(h.undo()!.base.strokes).toBe(20);
  });

  it("refuses to undo while a stroke is being drawn", () => {
    const h = new UndoHistory<number>();
    draw(h, 3);
    h.begin({ id: 4, logStart: 0, supplyBefore: supply });
    expect(h.undo()).toBeNull();
  });

  it("packs a stroke when it ends", () => {
    const h = new UndoHistory<number>();
    const stroke = h.begin({ id: 1, logStart: 0, supplyBefore: supply });
    h.add([normalizeHit(hit(0))], 0, 0);
    expect(Array.isArray(stroke.hits)).toBe(true);
    h.end();
    expect(Array.isArray(stroke.hits)).toBe(false);
  });

  it("reset hands back every payload", () => {
    const h = new UndoHistory<number>();
    draw(h, 25);
    expect(h.reset().sort()).toEqual([10, 20]);
    expect(h.total).toBe(0);
    expect(h.steps).toBe(0);
  });
});

describe("UndoHistory after a restore", () => {
  it("undo goes back to the restored sheet, not to a blank one", () => {
    const h = new UndoHistory<number>();
    draw(h, 4);
    const freed = h.restoreBase(12, 777);
    expect(freed).toEqual([]); // only the blank base existed
    expect(h.total).toBe(12);
    expect(h.steps).toBe(0);
    expect(h.retainedStrokes).toBe(0);

    draw(h, 3);
    expect(h.steps).toBe(3);
    const plan = h.undo()!;
    expect(plan.base).toEqual({ strokes: 12, payload: 777 });
    expect(plan.replay.map((s) => s.index)).toEqual([12, 13]);
    h.undo();
    h.undo();
    expect(h.undo()).toBeNull(); // the restored strokes cannot be undone
    expect(h.total).toBe(12);
  });

  it("hands back the checkpoints it drops", () => {
    const h = new UndoHistory<number>();
    draw(h, 25);
    expect(h.restoreBase(0, 1).sort()).toEqual([10, 20]);
  });
});
