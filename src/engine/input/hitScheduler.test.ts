import { describe, expect, it } from "vitest";
import { hashSeed } from "../util/prng";
import { HitScheduler, STATIONARY_GRACE_MS } from "./hitScheduler";
import type { StrokeContext, StrokeSample } from "./hitScheduler";

const ctx = (hz: number): StrokeContext => ({
  hz,
  cartridgeId: "rl-7",
  inkTone: 0,
  inkLevel: 1,
});

const sample = (
  x: number,
  y: number,
  t: number,
  depth = 0.5,
): StrokeSample => ({ x, y, t, depth });

/** Drags along +x at a constant speed (mm/s), reporting every `stepMs`. Returns every hit. */
function drag(opts: {
  hz: number;
  speed: number;
  stepMs: number;
  durationMs: number;
  x0?: number;
  y0?: number;
}) {
  const { hz, speed, stepMs, durationMs, x0 = 50, y0 = 75 } = opts;
  const s = new HitScheduler({ strokeId: 1 });
  const t0 = 1000;
  const hits = [...s.begin(sample(x0, y0, t0), ctx(hz))];
  const times: number[] = [];
  for (let t = stepMs; t < durationMs - 1e-9; t += stepMs) times.push(t);
  times.push(durationMs); // always end exactly at the duration, whatever the step
  for (const t of times) {
    hits.push(
      ...s.addSample(sample(x0 + (speed * t) / 1000, y0, t0 + t), ctx(hz)),
    );
  }
  return hits;
}

describe("hit spacing = speed / frequency", () => {
  it("100 Hz at 20 mm/s: 0.2 mm apart (a solid line)", () => {
    const hits = drag({ hz: 100, speed: 20, stepMs: 8, durationMs: 1000 });
    expect(hits).toHaveLength(101); // the strike at pointerdown plus one every 10 ms
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]!.x - hits[i - 1]!.x).toBeCloseTo(0.2, 6);
    }
  });

  it("100 Hz at 150 mm/s: 1.5 mm apart (separate dots)", () => {
    const hits = drag({ hz: 100, speed: 150, stepMs: 8, durationMs: 500 });
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]!.x - hits[i - 1]!.x).toBeCloseTo(1.5, 6);
    }
  });

  it("a faster machine packs hits closer at the same hand speed", () => {
    const slow = drag({ hz: 50, speed: 40, stepMs: 8, durationMs: 400 });
    const fast = drag({ hz: 150, speed: 40, stepMs: 8, durationMs: 400 });
    expect(slow[2]!.x - slow[1]!.x).toBeCloseTo(0.8, 6);
    expect(fast[2]!.x - fast[1]!.x).toBeCloseTo(40 / 150, 6);
  });

  it("slows down with the hand: spacing follows the speed in each stretch", () => {
    const s = new HitScheduler({ strokeId: 1 });
    const hits = [...s.begin(sample(0, 75, 0), ctx(100))];
    // 20 mm/s for 200 ms, then 80 mm/s for 200 ms
    for (let t = 10; t <= 200; t += 10)
      hits.push(...s.addSample(sample((20 * t) / 1000, 75, t), ctx(100)));
    for (let t = 210; t <= 400; t += 10) {
      hits.push(
        ...s.addSample(sample(4 + (80 * (t - 200)) / 1000, 75, t), ctx(100)),
      );
    }
    expect(hits[5]!.x - hits[4]!.x).toBeCloseTo(0.2, 6);
    expect(hits[35]!.x - hits[34]!.x).toBeCloseTo(0.8, 6);
  });
});

describe("time accumulator", () => {
  it("gives the same hits however the pointer reports", () => {
    const reference = drag({ hz: 100, speed: 30, stepMs: 1, durationMs: 700 });
    for (const stepMs of [2, 7, 16, 25, 100]) {
      const hits = drag({ hz: 100, speed: 30, stepMs, durationMs: 700 });
      expect(hits).toHaveLength(reference.length);
      hits.forEach((h, i) => {
        expect(h.x).toBeCloseTo(reference[i]!.x, 6);
        expect(h.t).toBeCloseTo(reference[i]!.t, 6);
      });
    }
  });

  it("carries time across events shorter than the hit period", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(10, 10, 0), ctx(100));
    let total = 0;
    for (let t = 1; t <= 9; t++)
      total += s.addSample(sample(10 + t * 0.01, 10, t), ctx(100)).length;
    expect(total).toBe(0); // 9 ms in: nothing yet
    expect(s.addSample(sample(10.1, 10, 10), ctx(100))).toHaveLength(1);
  });

  it("splits one long segment into the right number of hits", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(0, 0, 0), ctx(100));
    const hits = s.addSample(sample(10, 0, 1000), ctx(100));
    expect(hits).toHaveLength(100);
    expect(hits[99]!.x).toBeCloseTo(10, 6);
  });

  it("stamps hit times on a 1/f grid measured from the stroke start", () => {
    const hits = drag({ hz: 120, speed: 25, stepMs: 5, durationMs: 500 });
    hits.forEach((h, i) => expect(h.t).toBeCloseTo((i * 1000) / 120, 5));
  });

  it("a change of machine speed mid-stroke does not cause a burst", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(0, 0, 0), ctx(100));
    expect(s.addSample(sample(0.1, 0, 5), ctx(100))).toHaveLength(0); // 5 ms into a 10 ms period
    // now 200 Hz (5 ms period): the pending hit is due immediately, then every 5 ms
    const hits = s.addSample(sample(0.3, 0, 16), ctx(200));
    expect(hits.map((h) => h.t)).toEqual(
      [5, 10, 15].map((t) => expect.closeTo(t, 6)),
    );
  });

  it("does not divide by zero when two samples share a timestamp", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(0, 0, 100), ctx(100));
    expect(s.addSample(sample(5, 0, 100), ctx(100))).toEqual([]);
    expect(s.addSample(sample(5, 0, 100), ctx(100))).toEqual([]);
    const hits = s.addSample(sample(6, 0, 110), ctx(100));
    expect(hits).toHaveLength(1);
    expect(Number.isFinite(hits[0]!.speed)).toBe(true);
    expect(hits[0]!.x).toBeCloseTo(6, 6); // continues from where the same-instant sample moved to
  });
});

describe("stationary needle", () => {
  it("keeps hitting the same spot while the pointer is down but silent", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(80, 60, 1000), ctx(100));
    expect(s.advanceIdle(1000 + STATIONARY_GRACE_MS - 1, ctx(100))).toEqual([]);

    const hits = s.advanceIdle(1100, ctx(100));
    expect(hits).toHaveLength(10);
    for (const h of hits) {
      expect(h.x).toBe(80);
      expect(h.y).toBe(60);
      expect(h.speed).toBe(0);
    }
    expect(hits.map((h) => h.t)).toEqual(
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((t) =>
        expect.closeTo(t, 6),
      ),
    );
  });

  it("does not mistake a late pointer event for a stop", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(0, 0, 0), ctx(100));
    s.addSample(sample(1, 0, 20), ctx(100)); // 50 mm/s
    // the next event is 60 ms late: no stationary hits in the meantime
    expect(s.advanceIdle(80, ctx(100))).toEqual([]);
    const hits = s.addSample(sample(4, 0, 80), ctx(100));
    // the 60 ms are spread along the path 1 → 4 mm, not piled up at 1 mm
    expect(hits.map((h) => h.x)).toEqual([1.5, 2, 2.5, 3, 3.5, 4].map((x) => expect.closeTo(x, 6)));
  });

  it("carries leftover time between idle calls", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(0, 0, 0), ctx(100));
    expect(s.advanceIdle(100, ctx(100))).toHaveLength(10);
    expect(s.advanceIdle(105, ctx(100))).toHaveLength(0);
    expect(s.advanceIdle(110, ctx(100))).toHaveLength(1);
    expect(s.advanceIdle(160, ctx(100))).toHaveLength(5);
  });

  it("counts one hit per period however often it is polled", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(0, 0, 0), ctx(100));
    let total = 0;
    for (let now = 16; now <= 1000; now += 16)
      total += s.advanceIdle(now, ctx(100)).length;
    total += s.advanceIdle(1000, ctx(100)).length;
    expect(total).toBe(100);
  });

  it("resumes without duplicates or a gap when the hand moves again", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(0, 0, 0), ctx(100));
    s.advanceIdle(100, ctx(100)); // hits at 10..100 ms, all at the origin
    // an event stamped slightly before the idle clock arrives, then the hand moves for 50 ms
    expect(s.addSample(sample(0, 0, 98), ctx(100))).toEqual([]);
    const moved = s.addSample(sample(1, 0, 150), ctx(100)); // 50 ms after the 100 ms clock
    expect(moved.map((h) => h.t)).toEqual(
      [110, 120, 130, 140, 150].map((t) => expect.closeTo(t, 6)),
    );
    expect(moved[4]!.x).toBeCloseTo(1, 6);
  });

  it("does nothing before the stroke starts or with the machine off", () => {
    const s = new HitScheduler({ strokeId: 1 });
    expect(s.advanceIdle(500, ctx(100))).toEqual([]);
    expect(s.addSample(sample(1, 1, 10), ctx(100))).toEqual([]);
    s.begin(sample(0, 0, 0), ctx(100));
    expect(s.advanceIdle(500, ctx(0))).toEqual([]);
  });

  it("caps the hits from a huge time gap", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(0, 0, 0), ctx(150));
    const hits = s.advanceIdle(60 * 60 * 1000, ctx(150));
    expect(hits.length).toBeLessThanOrEqual(2000);
    expect(s.advanceIdle(60 * 60 * 1000 + 50, ctx(150))).toHaveLength(7); // and recovers
  });
});

describe("hit records", () => {
  it("starts with a strike at pointerdown", () => {
    const s = new HitScheduler({ strokeId: 1 });
    const [hit, ...rest] = s.begin(sample(12, 34, 500, 0.7), ctx(100));
    expect(rest).toHaveLength(0);
    expect(hit).toMatchObject({ x: 12, y: 34, t: 0, depth: 0.7, speed: 0 });
  });

  it("copies the machine context into each hit", () => {
    const s = new HitScheduler({ strokeId: 1 });
    const hits = s.begin(sample(1, 1, 0), {
      hz: 100,
      cartridgeId: "m1-7",
      inkTone: 0.4,
      inkLevel: 0.6,
    });
    expect(hits[0]).toMatchObject({
      cartridgeId: "m1-7",
      inkTone: 0.4,
      inkLevel: 0.6,
    });
  });

  it("interpolates depth along the segment", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(0, 0, 0, 0.2), ctx(100));
    const hits = s.addSample(sample(10, 0, 100, 0.8), ctx(100));
    expect(hits[4]!.depth).toBeCloseTo(0.2 + 0.6 * 0.5, 6); // halfway
    expect(hits[9]!.depth).toBeCloseTo(0.8, 6);
  });

  it("reports hand speed and direction of travel", () => {
    const hits = drag({ hz: 100, speed: 40, stepMs: 8, durationMs: 400 });
    const last = hits[hits.length - 1]!;
    expect(last.speed).toBeCloseTo(40, 3);
    expect(last.angle).toBeCloseTo(0, 6); // +x

    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(10, 10, 0), ctx(100));
    let down = [] as ReturnType<typeof s.addSample>;
    for (let t = 8; t <= 200; t += 8)
      down = s.addSample(sample(10, 10 + (40 * t) / 1000, t), ctx(100));
    expect(down[down.length - 1]?.angle ?? Math.PI / 2).toBeCloseTo(
      Math.PI / 2,
      6,
    ); // +y is down
  });

  it("keeps the last direction of travel when the hand stops", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(10, 10, 0), ctx(100));
    for (let t = 8; t <= 200; t += 8)
      s.addSample(sample(10, 10 + (40 * t) / 1000, t), ctx(100));
    const held = s.advanceIdle(400, ctx(100));
    expect(held.length).toBeGreaterThan(0);
    for (const h of held) expect(h.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("smooths the direction over distance, so pixel-sized zigzags do not wobble it", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(10, 10, 0), ctx(100));
    // a slow drag towards +x made of 0.3 mm steps that alternate 0.15 mm up and down
    const angles: number[] = [];
    for (let i = 1; i <= 40; i++) {
      const hits = s.addSample(sample(10 + i * 0.3, 10 + (i % 2 ? 0.15 : 0), i * 15), ctx(100));
      for (const h of hits) angles.push(h.angle);
    }
    expect(angles.length).toBeGreaterThan(10);
    const settled = angles.slice(5);
    expect(Math.max(...settled.map(Math.abs))).toBeLessThan(0.3); // raw segments alternate about ±0.46 rad
  });

  it("follows a curve with a short lag", () => {
    const s = new HitScheduler({ strokeId: 1 });
    s.begin(sample(0, 0, 0), ctx(100));
    let last = 0;
    // along +x for 5 mm, then a hard turn to +y
    for (let i = 1; i <= 50; i++) s.addSample(sample(i * 0.1, 0, i * 5), ctx(100));
    for (let i = 1; i <= 60; i++) {
      const hits = s.addSample(sample(5, i * 0.1, 250 + i * 5), ctx(100));
      if (hits.length) last = hits[hits.length - 1]!.angle;
    }
    expect(last).toBeGreaterThan(Math.PI / 2 - 0.1);
    expect(last).toBeLessThan(Math.PI / 2 + 0.1);
  });

  it("seeds each hit from (strokeId, hitIndex) and replays identically", () => {
    const a = drag({ hz: 100, speed: 20, stepMs: 8, durationMs: 300 });
    const b = drag({ hz: 100, speed: 20, stepMs: 3, durationMs: 300 });
    a.forEach((h, i) => {
      expect(h.seed).toBe(hashSeed(1, i));
      expect(h.seed).toBe(b[i]!.seed);
    });
  });
});

describe("sheet bounds", () => {
  it("discards hits outside the sheet but keeps the machine rhythm", () => {
    const s = new HitScheduler({ strokeId: 1 });
    // runs off the right edge (x = 200), turns around and comes back
    const hits = [...s.begin(sample(195, 75, 0), ctx(100))];
    for (let t = 20; t <= 1000; t += 20) {
      const x =
        t <= 500 ? 195 + (20 * t) / 1000 : 205 - (20 * (t - 500)) / 1000;
      hits.push(...s.addSample(sample(x, 75, t), ctx(100)));
    }
    expect(hits.every((h) => h.x <= 200 && h.x >= 0)).toBe(true);
    expect(hits.length).toBeLessThan(101);
    // every surviving hit still sits on the 10 ms grid
    for (const h of hits) expect((h.t / 10) % 1).toBeCloseTo(0, 5);
    // and the seeds skip the discarded indices
    const indices = hits.map((h) => h.seed);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("emits nothing for a stroke that starts off the sheet", () => {
    const s = new HitScheduler({ strokeId: 1 });
    expect(s.begin(sample(-5, 10, 0), ctx(100))).toEqual([]);
    expect(s.addSample(sample(-5, 10, 100), ctx(100))).toEqual([]);
  });
});
