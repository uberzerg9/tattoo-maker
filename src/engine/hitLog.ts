import type { Hit } from "./hit";

/** Hit centres kept for the debug overlay. */
export const HIT_LOG_CAPACITY = 200_000;

/**
 * Hit centres and their stencil distances, laid out for upload to the GPU as debug dots. The
 * hits themselves, which undo and restore replay, live in the UndoHistory.
 */
export class HitLog {
  /** Flat x, y pairs in sheet mm for GPU upload. */
  readonly positions = new Float32Array(HIT_LOG_CAPACITY * 2);
  /** Distance of each hit centre to the stencil in mm, or -1 where there was no stencil. */
  readonly deviations = new Float32Array(HIT_LOG_CAPACITY);
  /** Number of hit centres in `positions`. */
  count = 0;

  add(hits: readonly Hit[], distances: readonly number[] = []): void {
    for (const [i, hit] of hits.entries()) {
      if (this.count >= HIT_LOG_CAPACITY) return;
      this.positions[this.count * 2] = hit.x;
      this.positions[this.count * 2 + 1] = hit.y;
      const d = distances[i];
      this.deviations[this.count] = d !== undefined && Number.isFinite(d) ? d : -1;
      this.count++;
    }
  }

  /** Forgets the dots after the first `count` (undo). */
  truncate(count: number): void {
    this.count = Math.min(this.count, Math.max(0, count));
  }

  clear(): void {
    this.count = 0;
  }
}
