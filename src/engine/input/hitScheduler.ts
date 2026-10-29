import { SHEET_MM } from "../constants";
import type { Hit } from "../hit";
import type { CartridgeId } from "../types";
import { hashSeed } from "../util/prng";

/** A pointer position on the sheet. t is in ms on the PointerEvent.timeStamp clock. */
export interface StrokeSample {
  x: number;
  y: number;
  t: number;
  depth: number;
}

/** Machine and cartridge state at the moment the scheduler is called. */
export interface StrokeContext {
  hz: number;
  cartridgeId: CartridgeId;
  inkTone: number;
  inkLevel: number;
}

export interface HitSchedulerOptions {
  strokeId: number;
  /** Hits outside are discarded; they still advance the machine clock. */
  isInside?: (x: number, y: number) => boolean;
}

export const insideSheet = (x: number, y: number) =>
  x >= 0 && x <= SHEET_MM.width && y >= 0 && y <= SHEET_MM.height;

/** Time constant for the smoothed hand velocity. It only feeds speed and angle, never spacing. */
const VELOCITY_SMOOTHING_S = 0.03;
/**
 * Without new samples for this long the pointer counts as stationary and the needle keeps
 * hitting in place. Short silences are normal while moving (a slow frame delays events), and
 * hits are permanent, so this waits long enough not to mistake a late event for a stop. Hits
 * for the wait are backfilled at the last position, so a needle held still loses none.
 */
export const STATIONARY_GRACE_MS = 100;
/**
 * [tune] Distance over which the direction of travel is averaged. Smoothing by distance rather
 * than time keeps slow, pixel-stepped drags from making magnum rows wobble.
 */
const DIRECTION_SMOOTHING_MM = 1;
/** Safety net against a huge time gap (for example a suspended tab). */
const MAX_HITS_PER_CALL = 2000;
const EPSILON_S = 1e-9;

/**
 * Turns pointer samples into needle hits: one every 1/f seconds of stroke time, placed by
 * interpolating the hand path at that moment. Spacing = speed / f falls out of that; nothing
 * about lines or dots is drawn directly.
 *
 * A time accumulator carries across segments and events, so the machine rhythm does not
 * depend on how often the pointer reports.
 */
export class HitScheduler {
  private readonly strokeId: number;
  private readonly isInside: (x: number, y: number) => boolean;

  private startT = 0;
  /** Where the stroke is, and the time up to which hits have been scheduled. */
  private cursor: StrokeSample | null = null;
  private lastEventT = 0;
  /** Seconds since the last hit. */
  private acc = 0;
  private hitIndex = 0;
  private vx = 0;
  private vy = 0;
  private hasVelocity = false;
  /** Smoothed direction of travel; the angle holds when the hand stops. */
  private dirX = 0;
  private dirY = 0;
  private hasDirection = false;
  private angle = 0;

  constructor(options: HitSchedulerOptions) {
    this.strokeId = options.strokeId;
    this.isInside = options.isInside ?? insideSheet;
  }

  /** Smoothed hand speed, mm/s. */
  get speedMmS(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** Starts the stroke. The needle strikes once right away, so a tap leaves a mark. */
  begin(sample: StrokeSample, ctx: StrokeContext): Hit[] {
    this.startT = sample.t;
    this.cursor = { ...sample };
    this.lastEventT = sample.t;
    this.acc = 0;
    this.hitIndex = 0;
    this.vx = 0;
    this.vy = 0;
    this.hasVelocity = false;
    this.dirX = 0;
    this.dirY = 0;
    this.hasDirection = false;
    this.angle = 0;
    const hit = this.makeHit(
      sample.x,
      sample.y,
      sample.t,
      sample.depth,
      0,
      ctx,
    );
    return hit ? [hit] : [];
  }

  /** Adds the next pointer sample and returns the hits that fall between the previous one and it. */
  addSample(sample: StrokeSample, ctx: StrokeContext): Hit[] {
    const from = this.cursor;
    if (!from) return [];
    this.lastEventT = Math.max(this.lastEventT, sample.t);

    const dt = (sample.t - from.t) / 1000;
    if (dt <= 0) {
      // Same instant (or an event older than hits already scheduled): move, but no time passes.
      this.cursor = {
        x: sample.x,
        y: sample.y,
        t: from.t,
        depth: sample.depth,
      };
      return [];
    }

    this.updateVelocity((sample.x - from.x) / dt, (sample.y - from.y) / dt, dt);
    this.updateDirection(sample.x - from.x, sample.y - from.y);
    const hits = this.run(from, sample, dt, ctx, this.speedMmS);
    this.cursor = { ...sample };
    return hits;
  }

  /**
   * Call regularly while the pointer is down. Once no sample has arrived for
   * STATIONARY_GRACE_MS the needle is held still: hits keep landing on the same spot.
   */
  advanceIdle(nowMs: number, ctx: StrokeContext): Hit[] {
    const from = this.cursor;
    if (!from || nowMs - this.lastEventT < STATIONARY_GRACE_MS) return [];
    const dt = (nowMs - from.t) / 1000;
    if (dt <= 0) return [];

    this.vx = 0;
    this.vy = 0;
    this.hasVelocity = true;
    const to = { ...from, t: nowMs };
    const hits = this.run(from, to, dt, ctx, 0);
    this.cursor = to;
    return hits;
  }

  private updateVelocity(vx: number, vy: number, dt: number): void {
    if (!this.hasVelocity) {
      this.vx = vx;
      this.vy = vy;
      this.hasVelocity = true;
    } else {
      const k = 1 - Math.exp(-dt / VELOCITY_SMOOTHING_S);
      this.vx += (vx - this.vx) * k;
      this.vy += (vy - this.vy) * k;
    }
  }

  private updateDirection(dx: number, dy: number): void {
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    const k = this.hasDirection ? 1 - Math.exp(-dist / DIRECTION_SMOOTHING_MM) : 1;
    this.dirX += (dx / dist - this.dirX) * k;
    this.dirY += (dy / dist - this.dirY) * k;
    this.hasDirection = true;
    if (Math.hypot(this.dirX, this.dirY) > 1e-6) {
      this.angle = Math.atan2(this.dirY, this.dirX);
    }
  }

  /** Places every hit that falls inside the segment from → to (dt seconds long). */
  private run(
    from: StrokeSample,
    to: StrokeSample,
    dt: number,
    ctx: StrokeContext,
    speed: number,
  ): Hit[] {
    if (!(ctx.hz > 0)) return [];
    const period = 1 / ctx.hz;
    const hits: Hit[] = [];

    let remaining = Math.max(0, period - this.acc);
    let elapsed = 0;
    let emitted = false;
    let count = 0;

    while (dt - elapsed >= remaining - EPSILON_S) {
      if (++count > MAX_HITS_PER_CALL) {
        elapsed = dt;
        break;
      }
      elapsed += remaining;
      emitted = true;
      const f = Math.min(1, elapsed / dt);
      const hit = this.makeHit(
        from.x + (to.x - from.x) * f,
        from.y + (to.y - from.y) * f,
        from.t + elapsed * 1000,
        from.depth + (to.depth - from.depth) * f,
        speed,
        ctx,
      );
      if (hit) hits.push(hit);
      remaining = period;
    }

    this.acc = emitted ? Math.max(0, dt - elapsed) : this.acc + dt;
    return hits;
  }

  private makeHit(
    x: number,
    y: number,
    tAbsMs: number,
    depth: number,
    speed: number,
    ctx: StrokeContext,
  ): Hit | null {
    const index = this.hitIndex++;
    if (!this.isInside(x, y)) return null;
    return {
      x,
      y,
      t: tAbsMs - this.startT,
      speed,
      depth,
      angle: this.angle,
      cartridgeId: ctx.cartridgeId,
      inkTone: ctx.inkTone,
      inkLevel: ctx.inkLevel,
      seed: hashSeed(this.strokeId, index),
    };
  }
}
