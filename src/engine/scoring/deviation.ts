import type { StencilPlacement } from "../types";
import { sheetToStencil } from "../stencil";
import type { StencilSize } from "../stencil";

/** Hits farther than this from every stencil line are off-stencil: shading, not tracing. */
export const OFF_STENCIL_MM = 3;

/** A stencil's distance field: mm to the nearest line centre per texel, at scale 1. */
export interface StencilField {
  distanceMm: Float32Array;
  width: number;
  height: number;
  /** Physical size of the raster at scale 1. */
  size: StencilSize;
}

/**
 * Distance in mm, on the sheet, from a sheet point to the nearest line of a placed stencil.
 * Inside the stencil's raster the field is sampled bilinearly. Outside it the distance is that
 * of the nearest edge texel plus the way out to the point, which is always an over-estimate of
 * nothing and good enough: a point beyond the raster is far from lines other than the border's.
 */
export function distanceToStencil(field: StencilField, placement: StencilPlacement, xMm: number, yMm: number): number {
  const { width, height, size, distanceMm } = field;
  const { u, v } = sheetToStencil(xMm, yMm, placement, size);

  // texel centres sit half a texel in
  const fx = u * width - 0.5;
  const fy = v * height - 0.5;
  const cx = Math.min(Math.max(fx, 0), width - 1);
  const cy = Math.min(Math.max(fy, 0), height - 1);

  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = cx - x0;
  const ty = cy - y0;
  const d00 = distanceMm[y0 * width + x0]!;
  const d10 = distanceMm[y0 * width + x1]!;
  const d01 = distanceMm[y1 * width + x0]!;
  const d11 = distanceMm[y1 * width + x1]!;
  const inside = d00 * (1 - tx) * (1 - ty) + d10 * tx * (1 - ty) + d01 * (1 - tx) * ty + d11 * tx * ty;

  // how far the point lies outside the raster, in stencil mm
  const outX = Math.max(0, -u * size.widthMm, (u - 1) * size.widthMm);
  const outY = Math.max(0, -v * size.heightMm, (v - 1) * size.heightMm);
  return (inside + Math.hypot(outX, outY)) * placement.scale;
}

/** Running mean of distances. */
export class MeanTracker {
  private sum = 0;
  private count = 0;

  add(value: number): void {
    this.sum += value;
    this.count++;
  }

  /** The sum of the values. */
  get total(): number {
    return this.sum;
  }

  /** Sets the tracker to a saved sum and count. */
  set(sum: number, count: number): void {
    this.sum = sum;
    this.count = count;
  }

  /** Takes back values that were added together (an undone stroke). */
  remove(sum: number, count: number): void {
    this.count = Math.max(0, this.count - count);
    this.sum = this.count === 0 ? 0 : this.sum - sum;
  }

  /** Mean so far, or null before the first value. */
  get mean(): number | null {
    return this.count === 0 ? null : this.sum / this.count;
  }

  get samples(): number {
    return this.count;
  }

  reset(): void {
    this.sum = 0;
    this.count = 0;
  }
}

export interface ScoredHit {
  x: number;
  y: number;
  cartridgeId: string;
}

/**
 * Deviation as ENGINE.md §8 defines it: for liner cartridges only, the mean distance to the
 * stencil of every hit that lies within OFF_STENCIL_MM of a line. Hits farther away are
 * off-stencil and ignored, and so are hits of every other cartridge.
 */
export class DeviationScorer {
  private readonly isLiner: (cartridgeId: string) => boolean;
  private field: StencilField | null = null;
  private placement: StencilPlacement | null = null;
  /** Deviation over the whole work, and over the current session. */
  readonly work = new MeanTracker();
  readonly session = new MeanTracker();
  /** Sum and number of the distances the last add() counted, to take back on undo. */
  readonly lastAdded = { sum: 0, count: 0 };

  constructor(isLiner: (cartridgeId: string) => boolean) {
    this.isLiner = isLiner;
  }

  /** Sets the stencil hits are measured against. Call again, with null, when there is none. */
  setStencil(field: StencilField | null, placement: StencilPlacement | null): void {
    this.field = field;
    this.placement = placement;
  }

  setPlacement(placement: StencilPlacement): void {
    this.placement = placement;
  }

  /**
   * Takes an undone stroke's distances back out. The session only held it if the stroke
   * started inside the session.
   */
  removeStroke(sum: number, count: number, inSession: boolean): void {
    this.work.remove(sum, count);
    if (inSession) this.session.remove(sum, count);
  }

  /** Forgets every score, keeping the stencil. */
  reset(): void {
    this.work.reset();
    this.session.reset();
  }

  /**
   * Scores hits. Returns each hit's distance to the stencil in mm (NaN without a stencil), for
   * the debug heatmap; only liner hits near a line count towards the mean.
   */
  add(hits: readonly ScoredHit[]): number[] {
    const { field, placement } = this;
    this.lastAdded.sum = 0;
    this.lastAdded.count = 0;
    return hits.map((hit) => {
      if (!field || !placement) return Number.NaN;
      const d = distanceToStencil(field, placement, hit.x, hit.y);
      if (this.isLiner(hit.cartridgeId) && d <= OFF_STENCIL_MM) {
        this.work.add(d);
        this.session.add(d);
        this.lastAdded.sum += d;
        this.lastAdded.count++;
      }
      return d;
    });
  }
}
