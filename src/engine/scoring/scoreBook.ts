import type { Score, TraumaLevel } from "../types";
import type { DeviationScorer } from "./deviation";

/**
 * The score of the work, and of the current session: a window that starts at zero strokes
 * and zero deviation each time a session is written. Passes are strokes.
 */
export class ScoreBook {
  private sessionFirstStroke = 0;
  private level: TraumaLevel = "low";
  private readonly deviation: DeviationScorer;

  constructor(deviation: DeviationScorer) {
    this.deviation = deviation;
  }

  setTraumaLevel(level: TraumaLevel): void {
    this.level = level;
  }

  work(strokes: number): Score {
    return { passes: strokes, deviationMm: this.deviation.work.mean, traumaLevel: this.level };
  }

  session(strokes: number): Score {
    return {
      passes: Math.max(0, strokes - this.sessionFirstStroke),
      deviationMm: this.deviation.session.mean,
      traumaLevel: this.level,
    };
  }

  /** Index of the first stroke of the current session. */
  get sessionStart(): number {
    return this.sessionFirstStroke;
  }

  /** After an undo: a session cannot start after the last stroke that is left. */
  clampSession(strokes: number): void {
    this.sessionFirstStroke = Math.min(this.sessionFirstStroke, strokes);
  }

  /** Starts a new session window at the current stroke count. */
  startSession(strokes: number): void {
    this.sessionFirstStroke = strokes;
    this.deviation.session.reset();
  }
}
