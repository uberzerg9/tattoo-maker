import type { Hit } from "../hit";
import type { SupplyState } from "../types";
import { packHits, unpackHits } from "./packedHits";
import type { PackedHits } from "./packedHits";

/** [tune] A checkpoint is taken after every this many strokes. */
export const CHECKPOINT_EVERY = 10;
/** [tune] Checkpoints kept; with CHECKPOINT_EVERY this guarantees at least 30 undo steps. */
export const CHECKPOINTS_KEPT = 4;

export interface StrokeRecord {
  id: number;
  /** Number of strokes before this one. */
  index: number;
  /** Live hit objects while the stroke is active, a packed copy once it has ended. */
  hits: Hit[] | PackedHits;
  hitCount: number;
  /** Debug hit-dot count before this stroke, to cut the dot list back on undo. */
  logStart: number;
  supplyBefore: SupplyState;
  /** This stroke's contribution to the deviation mean. */
  deviationSum: number;
  deviationCount: number;
}

export interface Checkpoint<C> {
  /** Strokes already in the buffers at this checkpoint. */
  strokes: number;
  /** The GPU copy; null for the blank sheet before any stroke. */
  payload: C | null;
}

export interface UndoPlan<C> {
  /** The stroke being undone. */
  removed: StrokeRecord;
  /** Where to restart from: the nearest checkpoint at or before the new stroke count. */
  base: Checkpoint<C>;
  /** Strokes to stamp again on top of `base`, in order. */
  replay: StrokeRecord[];
  /** Checkpoints that no longer describe the sheet; the caller frees their payloads. */
  dropped: Checkpoint<C>[];
}

/**
 * The strokes that can still be undone, and the checkpoints they replay from. Pure
 * bookkeeping; the GPU copies live in `C`. Strokes older than the oldest checkpoint are
 * forgotten: they can no longer be undone, so nothing needs to keep their hits.
 */
export class UndoHistory<C> {
  /** Strokes done so far, undone ones taken off. */
  total = 0;
  private strokes: StrokeRecord[] = [];
  private checkpoints: Checkpoint<C>[] = [{ strokes: 0, payload: null }];
  private active: StrokeRecord | null = null;

  /** How many strokes undo() can take back right now. */
  get steps(): number {
    return this.total - this.checkpoints[0]!.strokes;
  }

  get retainedStrokes(): number {
    return this.strokes.length;
  }

  get retainedHits(): number {
    return this.strokes.reduce((n, s) => n + s.hitCount, 0);
  }

  get checkpointCount(): number {
    return this.checkpoints.length;
  }

  /** The record of the stroke being drawn, or null. */
  get current(): StrokeRecord | null {
    return this.active;
  }

  /** Opens a stroke on its first hit. */
  begin(record: Omit<StrokeRecord, "index" | "hits" | "hitCount" | "deviationSum" | "deviationCount">): StrokeRecord {
    const stroke: StrokeRecord = {
      ...record,
      index: this.total,
      hits: [],
      hitCount: 0,
      deviationSum: 0,
      deviationCount: 0,
    };
    this.active = stroke;
    this.strokes.push(stroke);
    this.total++;
    return stroke;
  }

  add(hits: readonly Hit[], deviationSum: number, deviationCount: number): void {
    const stroke = this.active;
    if (!stroke || !Array.isArray(stroke.hits)) return;
    for (const hit of hits) stroke.hits.push(hit);
    stroke.hitCount += hits.length;
    stroke.deviationSum += deviationSum;
    stroke.deviationCount += deviationCount;
  }

  /** Closes the stroke and packs its hits. True when a checkpoint is due. */
  end(): boolean {
    const stroke = this.active;
    if (!stroke) return false;
    this.active = null;
    if (Array.isArray(stroke.hits)) stroke.hits = packHits(stroke.hits);
    return this.total % CHECKPOINT_EVERY === 0;
  }

  /** Stores a checkpoint of the sheet as it is now. Returns the ones pushed out. */
  addCheckpoint(payload: C): Checkpoint<C>[] {
    this.checkpoints.push({ strokes: this.total, payload });
    const evicted: Checkpoint<C>[] = [];
    while (this.checkpoints.length > CHECKPOINTS_KEPT) evicted.push(this.checkpoints.shift()!);
    const oldest = this.checkpoints[0]!.strokes;
    this.strokes = this.strokes.filter((s) => s.index >= oldest);
    return evicted;
  }

  /** Takes the last stroke back. Null when there is nothing to undo or a stroke is active. */
  undo(): UndoPlan<C> | null {
    if (this.active || this.steps <= 0) return null;
    const removed = this.strokes.pop()!;
    this.total--;
    const dropped: Checkpoint<C>[] = [];
    while (this.checkpoints.length > 1 && this.checkpoints[this.checkpoints.length - 1]!.strokes > this.total) {
      dropped.push(this.checkpoints.pop()!);
    }
    const base = this.checkpoints[this.checkpoints.length - 1]!;
    const replay = this.strokes.filter((s) => s.index >= base.strokes);
    return { removed, base, replay, dropped };
  }

  /** Everything still known, oldest first; what a lost context is rebuilt from. */
  allStrokes(): readonly StrokeRecord[] {
    return this.strokes;
  }

  /**
   * The GPU copies are gone (lost context). Strokes before the first one still known cannot
   * be rebuilt, so the sheet restarts blank from there.
   */
  rebase(): void {
    this.checkpoints = [{ strokes: this.strokes[0]?.index ?? this.total, payload: null }];
  }

  /**
   * Starts over from a restored sheet: `total` strokes are on it and `payload` is a checkpoint
   * of it. Returns the payloads of the checkpoints that were dropped.
   */
  restoreBase(total: number, payload: C): C[] {
    const old = this.reset();
    this.total = total;
    this.checkpoints = [{ strokes: total, payload }];
    return old;
  }

  /** Empties the history; returns the payloads to free. */
  reset(): C[] {
    const payloads = this.checkpoints.flatMap((c) => (c.payload === null ? [] : [c.payload]));
    this.strokes = [];
    this.checkpoints = [{ strokes: 0, payload: null }];
    this.active = null;
    this.total = 0;
    return payloads;
  }
}

/** The hits of a stroke as objects, whether it is still active or packed. */
export function strokeHits(stroke: StrokeRecord): Hit[] {
  return Array.isArray(stroke.hits) ? stroke.hits : unpackHits(stroke.hits);
}
