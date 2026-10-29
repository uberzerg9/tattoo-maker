import type { Hit } from "./hit";

/** Hit centres kept for the debug overlay; later hits are still recorded per stroke. */
export const HIT_LOG_CAPACITY = 200_000;

export interface Stroke {
  id: number;
  hits: Hit[];
}

/**
 * Everything the needle has done. Strokes are the unit of undo and of the "passes" counter;
 * hits replay deterministically, so this is also what restore will rebuild the skin from.
 */
export class HitLog {
  readonly strokes: Stroke[] = [];
  /** Flat x, y pairs in sheet mm for GPU upload. */
  readonly positions = new Float32Array(HIT_LOG_CAPACITY * 2);
  /** Number of hit centres in `positions`. */
  count = 0;

  add(strokeId: number, hits: readonly Hit[]): void {
    let stroke = this.strokes[this.strokes.length - 1];
    if (!stroke || stroke.id !== strokeId) {
      stroke = { id: strokeId, hits: [] };
      this.strokes.push(stroke);
    }
    for (const hit of hits) {
      stroke.hits.push(hit);
      if (this.count < HIT_LOG_CAPACITY) {
        this.positions[this.count * 2] = hit.x;
        this.positions[this.count * 2 + 1] = hit.y;
        this.count++;
      }
    }
  }

  clear(): void {
    this.strokes.length = 0;
    this.count = 0;
  }
}
