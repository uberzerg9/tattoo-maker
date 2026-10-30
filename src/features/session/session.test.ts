import { describe, expect, it } from "vitest";
import { buildSession } from "./session";

const meta = { workId: "work-1", startedAt: new Date("2026-10-30T10:00:00Z"), endedAt: new Date("2026-10-30T10:30:00Z") };

describe("buildSession", () => {
  it("records strokes, deviation and trauma level for the work", () => {
    expect(buildSession({ passes: 7, deviationMm: 0.42, traumaLevel: "medium" }, meta)).toEqual({
      ...meta,
      passes: 7,
      deviationMm: 0.42,
      traumaLevel: "medium",
    });
  });

  it("records nothing when no stroke was made", () => {
    expect(buildSession({ passes: 0, deviationMm: 0.4, traumaLevel: "low" }, meta)).toBeNull();
  });

  it("records nothing without a measured deviation, which would corrupt the profile average", () => {
    expect(buildSession({ passes: 5, deviationMm: null, traumaLevel: "low" }, meta)).toBeNull();
    expect(buildSession({ passes: 5, deviationMm: Number.NaN, traumaLevel: "low" }, meta)).toBeNull();
  });

  it("keeps a perfect trace: a deviation of exactly 0 is a measurement", () => {
    expect(buildSession({ passes: 1, deviationMm: 0, traumaLevel: "low" }, meta)?.deviationMm).toBe(0);
  });
});
