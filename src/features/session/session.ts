import type { Score, TraumaLevel } from "../../engine/types";

/** A practice session, as the Cloud Function that updates the profile statistics expects it. */
export interface SessionRecord {
  workId: string;
  startedAt: Date;
  endedAt: Date;
  passes: number;
  deviationMm: number;
  traumaLevel: TraumaLevel;
}

/**
 * The session to write for a score, or null when there is nothing to record.
 *
 * A session needs strokes, and a measured deviation: the statistics function averages
 * `deviationMm` into the profile, so a session without one would corrupt the average.
 */
export function buildSession(
  score: Score,
  meta: { workId: string; startedAt: Date; endedAt: Date },
): SessionRecord | null {
  if (score.passes <= 0 || score.deviationMm === null || !Number.isFinite(score.deviationMm)) return null;
  return {
    workId: meta.workId,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    passes: score.passes,
    deviationMm: score.deviationMm,
    traumaLevel: score.traumaLevel,
  };
}
