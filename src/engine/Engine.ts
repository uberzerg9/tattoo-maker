import { createContext, parseHex } from "./gl/context";
import { depthFromPointer } from "./hit";
import type { Hit } from "./hit";
import { HitLog } from "./hitLog";
import { UndoHistory, strokeHits } from "./undo/history";
import { normalizeHit } from "./undo/packedHits";
import { decodeBuffers, encodeBuffers } from "./snapshot/format";
import { encodePreview } from "./snapshot/preview";
import { StampPlanner } from "./brushes/stampPlan";
import { CAP_ORDER, INK_TONE, InkSupply } from "./ink";
import { DeviationScorer } from "./scoring/deviation";
import { ScoreBook } from "./scoring/scoreBook";
import { overworkShare, sumCells, traumaLevelFromShare } from "./scoring/trauma";
import { HitScheduler, insideSheet } from "./input/hitScheduler";
import type { StrokeContext, StrokeSample } from "./input/hitScheduler";
import { bundledPresets } from "./presets";
import type { PresetBundle } from "./presets";
import { Compositor } from "./render/Compositor";
import type { StencilDraw } from "./render/Compositor";
import type { CheckpointSlot } from "./render/Checkpoints";
import { GpuTimer } from "./render/GpuTimer";
import type {
  CartridgeId,
  DebugOptions,
  DebugStats,
  EngineEvents,
  EngineState,
  EngineOptions,
  EngineView,
  InkCapId,
  RenderMode,
  Score,
  StencilPlacement,
  SupplyState,
  TattooEngine,
  WorkSnapshot,
} from "./types";
import { defaultPlacement, clampPlacement, stencilSizeMm } from "./stencil";
import { Emitter } from "./util/emitter";
import { DEFAULT_VIEW, screenToSheetMm } from "./view";
import type { StencilSize } from "./stencil";
import type { Point, Size } from "./view";

const DEFAULT_SKIN_HEX = "#e6c3a7";
const DEFAULT_MACHINE_HZ = 85;
const STATS_WINDOW_MS = 1000;
/** `score` events and trauma reductions are throttled to about four a second. */
const SCORE_INTERVAL_MS = 250;
/** Hits stamped per planning chunk; at 15 needles each this stays under one instanced draw. */
const STAMP_CHUNK_HITS = 4000;
/** Width of the preview image saved with a work; its height follows the sheet. */
const PREVIEW_WIDTH_PX = 512;

interface ActiveStroke {
  id: number;
  pointerId: number;
  scheduler: HitScheduler;
  lastHit: Hit | null;
}

export class Engine implements TattooEngine {
  private readonly options: EngineOptions;
  private readonly events = new Emitter<EngineEvents>();
  private readonly presets: PresetBundle;
  private readonly planner: StampPlanner;
  private readonly supply: InkSupply;

  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private compositor: Compositor | null = null;
  private gpuTimer: GpuTimer | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private view: EngineView = { ...DEFAULT_VIEW };
  private skinHex = DEFAULT_SKIN_HEX;
  private skinDirty = true;

  private cartridgeId: CartridgeId = "m1-7";
  private inkCap: InkCapId = "black";
  private machineHz = DEFAULT_MACHINE_HZ;

  /** Hit centres for the debug dots. */
  private readonly hitLog = new HitLog();
  /** Strokes that can still be undone, their hits, and the checkpoints they replay from. */
  private readonly history = new UndoHistory<CheckpointSlot>();
  private emittedUndoSteps = -1;
  /**
   * The caps and cartridges as they were when the last stroke ended. Undoing a stroke puts
   * them back, which also takes back any dip made since the stroke before it.
   */
  private restSupply: SupplyState;
  /** Hits recorded since the last frame; stamped into the ink buffer by the next render. */
  private readonly pendingHits: Hit[] = [];
  /** Replay the remembered strokes into a fresh ink buffer (after a lost context). */
  private restamp = false;
  private stroke: ActiveStroke | null = null;
  private nextStrokeId = 1;
  private tickRequest = 0;

  private debugOptions: DebugOptions = {
    showHitCentres: false,
    showTraumaHeatmap: false,
    showDeviationHeatmap: false,
    depthOverride: null,
  };
  private renderMode: RenderMode = "fresh";

  private stencil: {
    bitmap: ImageBitmap;
    distanceField: Float32Array;
    width: number;
    height: number;
    size: StencilSize;
  } | null = null;
  private stencilPlacement: StencilPlacement = defaultPlacement();
  private stencilVisible = true;
  private stencilOpacity = 0.6;
  private stencilLocked = false;
  private dotsStamped = 0;

  private readonly deviation: DeviationScorer;
  private readonly scoreBook: ScoreBook;
  private lastOverworkShare = 0;
  /** Ink or trauma changed since the last GPU reduction. */
  private reduceDirty = false;
  private lastReduceAt = 0;
  private reducePollRequest = 0;
  private scoreTimer = 0;
  private lastScoreAt = 0;
  private frameRequest = 0;
  private cursorScreen: Point | null = null;
  private renderStamps: number[] = [];
  private hitStamps: number[] = [];
  private lastRenderMs = 0;
  private lastStampMs = 0;
  private lastBatchDots = 0;
  /** What the UI was last told about the ink, so events fire only on change. */
  private emittedInkLevel: number | null = null;
  private emittedCaps = "";
  private lastSpacingMm: number | null = null;
  private lastDepth: number | null = null;

  constructor(options: EngineOptions = {}) {
    this.options = options;
    this.presets = options.presets ?? bundledPresets;
    this.planner = new StampPlanner(this.presets, options.tuning?.dotScale);
    this.supply = new InkSupply(this.presets);
    this.restSupply = this.supply.snapshot();
    this.deviation = new DeviationScorer((id) => this.presets.cartridges[id as CartridgeId]?.group === "RL");
    this.scoreBook = new ScoreBook(this.deviation);
  }

  mount(canvas: HTMLCanvasElement): void {
    if (this.canvas) this.destroy();
    const result = createContext(canvas, Boolean(this.options.debug));
    if (!result.gl) {
      this.events.emit("unsupported", result.error);
      return;
    }
    this.canvas = canvas;
    this.gl = result.gl;
    this.initGpu();

    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    if (this.options.debug) {
      canvas.addEventListener("pointermove", this.onDebugPointerMove);
      canvas.addEventListener("pointerleave", this.onDebugPointerLeave);
    }
    this.resizeObserver = new ResizeObserver(() => this.requestRender());
    this.resizeObserver.observe(canvas);
    this.emitInkState(true);
    this.requestRender();
  }

  destroy(): void {
    cancelAnimationFrame(this.frameRequest);
    cancelAnimationFrame(this.tickRequest);
    this.frameRequest = 0;
    this.tickRequest = 0;
    this.stroke = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    const canvas = this.canvas;
    if (canvas) {
      canvas.removeEventListener("webglcontextlost", this.onContextLost);
      canvas.removeEventListener(
        "webglcontextrestored",
        this.onContextRestored,
      );
      canvas.removeEventListener("pointermove", this.onDebugPointerMove);
      canvas.removeEventListener("pointerleave", this.onDebugPointerLeave);
    }
    this.gpuTimer?.dispose();
    this.gpuTimer = null;
    this.compositor?.dispose();
    this.compositor = null;
    this.pendingHits.length = 0;
    this.gl = null;
    this.canvas = null;
    cancelAnimationFrame(this.reducePollRequest);
    window.clearTimeout(this.scoreTimer);
    this.scoreTimer = 0;
    this.events.clear();
  }

  setCartridge(id: CartridgeId): void {
    this.cartridgeId = id;
    this.emitInkState();
  }

  /** Chooses the cap the next dip() takes from. Ink already in the needle is not affected. */
  setInk(capId: InkCapId): void {
    this.inkCap = capId;
  }

  /** Fills the current cartridge from the selected cap; does nothing if that cap is empty. */
  dip(): void {
    if (this.supply.dip(this.cartridgeId, this.inkCap)) {
      this.emitInkState();
      this.markDirty();
    }
  }

  setMachineHz(hz: number): void {
    this.machineHz = hz;
  }

  setSkinTone(hex: string): void {
    this.skinHex = hex;
    this.skinDirty = true;
    this.requestRender();
  }

  setView(view: EngineView): void {
    this.view = view;
    this.requestRender();
  }

  /** FRESH or HEALED. Only changes how the buffers are composited: nothing is stamped again. */
  setRenderMode(mode: RenderMode): void {
    this.renderMode = mode;
    this.requestRender();
  }

  /**
   * Puts a stencil on the skin: a mask (lines in the red channel) and, per texel of the same
   * raster, the distance in mm to the nearest line centre. The stencil can be moved until
   * applyStencil(); nothing can be drawn before that. Replacing it starts placing again.
   */
  setStencil(mask: ImageBitmap, distanceField: Float32Array): void {
    if (distanceField.length !== mask.width * mask.height) {
      throw new Error("The distance field must have one value per mask texel");
    }
    this.stencil?.bitmap.close();
    this.stencil = {
      bitmap: mask,
      distanceField,
      width: mask.width,
      height: mask.height,
      size: stencilSizeMm(mask.width, mask.height),
    };
    this.compositor?.setStencil(mask);
    this.stencilPlacement = clampPlacement(defaultPlacement(), this.stencil.size);
    this.deviation.setStencil(
      { distanceMm: distanceField, width: mask.width, height: mask.height, size: this.stencil.size },
      this.stencilPlacement,
    );
    this.setStencilLocked(false);
    this.requestRender();
  }

  /** Fixes the stencil where it is: it can no longer be moved, and drawing starts. */
  applyStencil(): void {
    if (!this.stencil) return;
    this.setStencilLocked(true);
  }

  /** Takes the stencil off the skin again (placement was cancelled). The ink on the sheet is untouched. */
  removeStencil(): void {
    if (!this.stencil) return;
    this.stencil.bitmap.close();
    this.stencil = null;
    this.compositor?.clearStencil();
    this.deviation.setStencil(null, null);
    this.stencilPlacement = defaultPlacement();
    this.setStencilLocked(false);
    this.requestRender();
  }

  setStencilPlacement(placement: StencilPlacement): void {
    if (!this.stencil || this.stencilLocked) return;
    this.stencilPlacement = clampPlacement(placement, this.stencil.size);
    this.deviation.setPlacement(this.stencilPlacement);
    this.requestRender();
  }

  setStencilVisibility(visible: boolean, opacity: number): void {
    this.stencilVisible = visible;
    this.stencilOpacity = Math.min(1, Math.max(0, opacity));
    this.requestRender();
  }

  /** Raw pointer events from the UI while the needle tool is active. */
  pointer(e: PointerEvent): void {
    switch (e.type) {
      case "pointerdown":
        if (e.button === 0 && !this.stroke) this.beginStroke(e);
        break;
      case "pointermove":
        if (this.isStrokePointer(e)) this.addSamples(e);
        break;
      case "pointerup":
        if (this.isStrokePointer(e)) {
          this.addSamples(e);
          this.endStroke();
        }
        break;
      case "pointercancel":
        if (this.isStrokePointer(e)) this.endStroke();
        break;
    }
  }

  /**
   * Throws away the stroke in progress as if it had never been started: its hits, the ink it used and its score
   * go, exactly like an undo of it. For a second finger landing in the middle of a stroke.
   */
  cancelStroke(): void {
    if (!this.stroke) return;
    const drew = this.history.current !== null;
    this.stroke = null;
    cancelAnimationFrame(this.tickRequest);
    this.tickRequest = 0;
    if (!drew) {
      this.requestRender();
      return;
    }
    const wasDirty = this.dirtyState;
    this.history.end(); // packs the stroke; no checkpoint is taken for something that is about to go
    this.undo();
    if (!wasDirty) this.clearDirty(); // the sheet is as it was: nothing new to save
  }

  /**
   * Takes the last stroke back: restores the nearest checkpoint before it and replays the
   * strokes in between. Hits carry their own seeds, so the replay stamps the same pixels.
   */
  undo(): void {
    const compositor = this.compositor;
    if (!compositor || this.stroke || this.history.steps <= 0) return;
    const plan = this.history.undo();
    if (!plan) return;
    const { removed, base, replay, dropped } = plan;

    this.pendingHits.length = 0;
    if (!this.restamp) {
      compositor.restoreCheckpoint(base.payload);
      this.stampHits(
        compositor,
        replay.flatMap((s) => strokeHits(s)),
      );
    }
    for (const c of dropped) if (c.payload) compositor.releaseCheckpoint(c.payload);

    this.supply.restore(removed.supplyBefore);
    this.restSupply = removed.supplyBefore;
    this.hitLog.truncate(removed.logStart);
    this.deviation.removeStroke(
      removed.deviationSum,
      removed.deviationCount,
      removed.index >= this.scoreBook.sessionStart,
    );
    this.scoreBook.clampSession(this.history.total);
    this.lastSpacingMm = null;
    this.lastDepth = null;
    this.reduceDirty = true;
    this.emitInkState();
    this.emitUndoSteps();
    this.emitScoreSoon();
    this.markDirty();
    this.requestRender();
  }

  async snapshot(): Promise<WorkSnapshot> {
    const compositor = this.compositor;
    if (!compositor) throw new Error("The engine has no GPU context to read the sheet from");
    // Everything below up to the encoding runs without yielding, so the buffers and the state agree.
    this.flushStamps(compositor);
    const raw = compositor.readBuffers();
    const preview = compositor.renderPreview(PREVIEW_WIDTH_PX);
    const state = this.captureState();
    const [buffers, previewBlob] = await Promise.all([encodeBuffers(raw), encodePreview(preview)]);
    return { ...buffers, preview: previewBlob, state };
  }

  async restore(s: Pick<WorkSnapshot, "ink" | "trauma" | "state">): Promise<void> {
    const raw = await decodeBuffers(s.ink, s.trauma);
    const compositor = this.compositor;
    if (!compositor) throw new Error("The engine has no GPU context to restore the sheet into");
    const { state } = s;
    if (state.version !== 1) throw new Error(`Unsupported work state version ${String(state.version)}`);

    if (this.stroke) this.endStroke();
    compositor.writeBuffers(raw);
    this.pendingHits.length = 0;
    this.restamp = false;
    // The restored sheet is the base undo will replay new strokes onto.
    const base = compositor.saveCheckpoint();
    for (const old of this.history.restoreBase(state.strokes, base)) compositor.releaseCheckpoint(old);

    this.supply.restore(state.supply);
    this.restSupply = this.supply.snapshot();
    this.deviation.reset();
    this.deviation.work.set(state.deviation.sum, state.deviation.count);
    this.scoreBook.startSession(state.strokes);
    this.scoreBook.setTraumaLevel("low");
    this.lastOverworkShare = 0;
    this.hitLog.clear();
    if (state.placement && this.stencil) {
      this.stencilPlacement = clampPlacement(state.placement, this.stencil.size);
      this.deviation.setPlacement(this.stencilPlacement);
    }
    this.setStencilLocked(state.strokes > 0);
    this.lastSpacingMm = null;
    this.lastDepth = null;
    this.reduceDirty = true;
    this.emitInkState(true);
    this.emitUndoSteps();
    this.emitScoreSoon();
    this.clearDirty();
    this.requestRender();
  }

  /** Everything about the work that is not in the pixel buffers. */
  private captureState(): EngineState {
    return {
      version: 1,
      presetsVersion: this.presets.version,
      strokes: this.history.total,
      deviation: { sum: this.deviation.work.total, count: this.deviation.work.samples },
      supply: this.supply.snapshot(),
      placement: this.stencil ? { ...this.stencilPlacement } : null,
    };
  }

  /** Whether the UI was last told the work has unsaved changes. */
  private dirtyState = false;

  private clearDirty(): void {
    this.dirtyState = false;
    this.events.emit("dirty", false);
  }

  private markDirty(): void {
    this.dirtyState = true;
    this.events.emit("dirty", true);
  }

  on<K extends keyof EngineEvents>(
    event: K,
    cb: (payload: EngineEvents[K]) => void,
  ): () => void {
    return this.events.on(event, cb);
  }

  setDebugOptions(options: Partial<DebugOptions>): void {
    this.debugOptions = { ...this.debugOptions, ...options };
    this.requestRender();
  }

  clearHits(): void {
    this.hitLog.clear();
    const compositor = this.compositor;
    for (const slot of this.history.reset()) compositor?.releaseCheckpoint(slot);
    this.restSupply = this.supply.snapshot();
    this.markDirty();
    this.emitUndoSteps();
    this.pendingHits.length = 0;
    this.compositor?.clearBuffers();
    this.deviation.reset();
    this.scoreBook.startSession(0);
    this.scoreBook.setTraumaLevel("low");
    this.lastOverworkShare = 0;
    this.reduceDirty = true;
    this.emitScoreSoon();
    this.lastSpacingMm = null;
    this.lastDepth = null;
    if (this.stroke) this.stroke.lastHit = null;
    this.requestRender();
  }

  /** A clean sheet: no ink, no strokes, no stencil, full caps. The skin tone stays. */
  newWork(): void {
    this.clearHits();
    this.supply.restore({ caps: { black: 1, g60: 1, g30: 1, g10: 1, white: 1 }, needles: {} });
    this.restSupply = this.supply.snapshot();
    this.stencil?.bitmap.close();
    this.stencil = null;
    this.compositor?.clearStencil();
    this.deviation.setStencil(null, null);
    this.stencilPlacement = defaultPlacement();
    this.setStencilLocked(false);
    this.scoreBook.startSession(0);
    this.emitInkState(true);
    this.clearDirty();
    this.requestRender();
  }

  getDebugStats(): DebugStats {
    const now = performance.now();
    const recent = (stamps: number[]) =>
      stamps.filter((t) => now - t <= STATS_WINDOW_MS).length;
    const stage = this.stageSize();
    const cursorMm =
      this.cursorScreen && stage
        ? screenToSheetMm(
            this.cursorScreen.x,
            this.cursorScreen.y,
            this.view,
            stage,
          )
        : null;
    return {
      framesPerSecond: recent(this.renderStamps),
      renderMs: this.lastRenderMs,
      cursorMm,
      hitsPerSecond: recent(this.hitStamps),
      handSpeedMmS: this.stroke?.scheduler.speedMmS ?? 0,
      lastSpacingMm: this.lastSpacingMm,
      lastDepth: this.lastDepth,
      hitCount: this.history.retainedHits,
      strokeCount: this.history.total,
      undoSteps: this.history.steps,
      checkpointSlots: this.compositor?.checkpointSlots ?? 0,
      stampMs: this.lastStampMs,
      lastBatchDots: this.lastBatchDots,
      dotsStamped: this.dotsStamped,
      overworkShare: this.lastOverworkShare,
      deviationMm: this.deviation.work.mean,
      inkLevel: this.supply.level(this.cartridgeId),
      inkTone: this.supply.tone(this.cartridgeId),
      gpuMs: this.gpuTimer?.lastMs ?? null,
    };
  }

  // --- strokes -------------------------------------------------------------------------

  private strokeContext(): StrokeContext {
    return {
      hz: this.machineHz,
      cartridgeId: this.cartridgeId,
      // Placeholders: InkSupply.apply() sets the ink each hit really carries as it is recorded.
      inkTone: INK_TONE.black,
      inkLevel: 1,
    };
  }

  private isStrokePointer(e: PointerEvent): boolean {
    return this.stroke !== null && e.pointerId === this.stroke.pointerId;
  }

  /** Pointer position on the sheet in mm, on the PointerEvent clock. */
  private sampleFrom(e: PointerEvent): StrokeSample | null {
    const canvas = this.canvas;
    const stage = this.stageSize();
    if (!canvas || !stage) return null;
    const rect = canvas.getBoundingClientRect();
    const mm = screenToSheetMm(
      e.clientX - rect.left,
      e.clientY - rect.top,
      this.view,
      stage,
    );
    return {
      x: mm.x,
      y: mm.y,
      t: e.timeStamp,
      depth: this.debugOptions.depthOverride ?? depthFromPointer(e.pointerType, e.pressure),
    };
  }

  private beginStroke(e: PointerEvent): void {
    // A stencil that has not been applied yet is still being placed: nothing is drawn until applyStencil().
    if (this.stencil && !this.stencilLocked) return;
    const sample = this.sampleFrom(e);
    if (!sample) return;
    const id = this.nextStrokeId++;
    const scheduler = new HitScheduler({ strokeId: id, isInside: insideSheet });
    this.stroke = { id, pointerId: e.pointerId, scheduler, lastHit: null };
    this.record(scheduler.begin(sample, this.strokeContext()));
    this.tickRequest = requestAnimationFrame(this.tick);
  }

  /** Coalesced events carry every position the hardware reported since the last event. */
  private addSamples(e: PointerEvent): void {
    const stroke = this.stroke;
    if (!stroke) return;
    const coalesced =
      typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    const events = coalesced.length > 0 ? coalesced : [e];
    const ctx = this.strokeContext();
    for (const event of events) {
      const sample = this.sampleFrom(event);
      if (sample) this.record(stroke.scheduler.addSample(sample, ctx));
    }
  }

  private endStroke(): void {
    this.stroke = null;
    cancelAnimationFrame(this.tickRequest);
    this.tickRequest = 0;
    const drewSomething = this.history.current !== null;
    if (this.history.end()) this.takeCheckpoint();
    if (drewSomething) {
      this.restSupply = this.supply.snapshot();
      this.markDirty();
    }
    this.emitUndoSteps();
    this.requestRender();
  }

  /** Copies the sheet as it is now, for undo to restart from. */
  private takeCheckpoint(): void {
    const compositor = this.compositor;
    if (!compositor) return;
    this.flushStamps(compositor); // the copy must hold every hit of the strokes so far
    const slot = compositor.saveCheckpoint();
    for (const old of this.history.addCheckpoint(slot)) if (old.payload) compositor.releaseCheckpoint(old.payload);
  }

  private emitUndoSteps(): void {
    const steps = this.history.steps;
    if (steps === this.emittedUndoSteps) return;
    this.emittedUndoSteps = steps;
    this.events.emit("undoSteps", steps);
  }

  /** While a stroke is active the needle keeps hitting even if the pointer is still. */
  private readonly tick = (): void => {
    this.tickRequest = 0;
    const stroke = this.stroke;
    if (!stroke) return;
    const hits = stroke.scheduler.advanceIdle(
      performance.now(),
      this.strokeContext(),
    );
    if (hits.length > 0) {
      this.record(hits);
      // The tick already runs on an animation frame, so draw in it instead of waiting for the next.
      if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
      this.frameRequest = 0;
      this.render();
    }
    this.tickRequest = requestAnimationFrame(this.tick);
  };

  private record(hits: Hit[]): void {
    const stroke = this.stroke;
    if (!stroke || hits.length === 0) return;
    if (!this.history.current) {
      this.history.begin({ id: stroke.id, logStart: this.hitLog.count, supplyBefore: this.restSupply });
    }
    this.supply.apply(hits);
    for (const hit of hits) normalizeHit(hit); // float32, so a packed replay stamps the same pixels
    const distances = this.deviation.add(hits);
    this.history.add(hits, this.deviation.lastAdded.sum, this.deviation.lastAdded.count);
    this.hitLog.add(hits, distances);
    this.emitUndoSteps();
    this.emitScoreSoon();
    for (const hit of hits) this.pendingHits.push(hit);
    const now = performance.now();
    for (const hit of hits) {
      this.hitStamps.push(now);
      if (stroke.lastHit) {
        this.lastSpacingMm = Math.hypot(
          hit.x - stroke.lastHit.x,
          hit.y - stroke.lastHit.y,
        );
      }
      stroke.lastHit = hit;
      this.lastDepth = hit.depth;
    }
    while (
      this.hitStamps.length > 0 &&
      now - (this.hitStamps[0] ?? now) > STATS_WINDOW_MS
    ) {
      this.hitStamps.shift();
    }
    this.requestRender();
  }

  // --- GPU and drawing -----------------------------------------------------------------

  private initGpu(): void {
    if (!this.gl) return;
    try {
      this.compositor = new Compositor(this.gl, this.presets);
    } catch {
      // The ink buffer could not be created or rendered to (no usable RGBA16F target).
      this.compositor = null;
      this.events.emit("unsupported", "float-render-targets");
      return;
    }
    if (this.options.debug) this.gpuTimer = new GpuTimer(this.gl);
    if (this.stencil) this.compositor.setStencil(this.stencil.bitmap);
    this.skinDirty = true;
    // A new context starts with an empty ink buffer; hits replay deterministically into it.
    // The old checkpoints went with the old context.
    this.history.rebase();
    this.emitUndoSteps();
    this.restamp = true;
    this.reduceDirty = true;
  }

  private readonly onContextLost = (e: Event): void => {
    e.preventDefault();
    cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
    this.gpuTimer = null;
    this.compositor = null;
  };

  private readonly onContextRestored = (): void => {
    this.initGpu();
    this.requestRender();
  };

  private readonly onDebugPointerMove = (e: PointerEvent): void => {
    const rect = this.canvas?.getBoundingClientRect();
    if (!rect) return;
    this.cursorScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.requestRender();
  };

  private readonly onDebugPointerLeave = (): void => {
    this.cursorScreen = null;
    this.requestRender();
  };

  /** Redraws on the next animation frame. Idle = no GPU work. */
  private requestRender(): void {
    if (this.frameRequest || !this.compositor) return;
    this.frameRequest = requestAnimationFrame(this.render);
  }

  private stageSize(): Size | null {
    const canvas = this.canvas;
    if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0)
      return null;
    return { width: canvas.clientWidth, height: canvas.clientHeight };
  }

  private stencilToDraw(): StencilDraw | null {
    if (!this.stencil || !this.stencilVisible) return null;
    return { placement: this.stencilPlacement, size: this.stencil.size, opacity: this.stencilOpacity };
  }

  private setStencilLocked(locked: boolean): void {
    if (this.stencilLocked === locked) return;
    this.stencilLocked = locked;
    this.events.emit("stencilLocked", locked);
  }

  /** Tells the UI about the ink in the current cartridge and in the caps when it has changed. */
  private emitInkState(force = false): void {
    const level = this.supply.level(this.cartridgeId);
    if (force || level !== this.emittedInkLevel) {
      this.emittedInkLevel = level;
      this.events.emit("inkLevel", level);
    }
    const caps = this.supply.capLevels();
    const key = CAP_ORDER.map((cap) => caps[cap]).join(",");
    if (force || key !== this.emittedCaps) {
      this.emittedCaps = key;
      this.events.emit("capLevels", caps);
    }
  }

  /** The score of the current session. Works after destroy(): it only reads CPU state. */
  sessionScore(): Score {
    return this.scoreBook.session(this.history.total);
  }

  startSession(): void {
    this.scoreBook.startSession(this.history.total);
  }

  /**
   * Keeps the trauma level up to date: collects a finished GPU reduction, and starts the next
   * one when the buffers changed. The read-back is asynchronous, so this never waits.
   */
  private maintainReduction(compositor: Compositor): void {
    const cells = compositor.pollReduction();
    if (cells) {
      this.lastOverworkShare = overworkShare(sumCells(cells));
      this.scoreBook.setTraumaLevel(traumaLevelFromShare(this.lastOverworkShare));
      this.emitScoreSoon();
    }
    const now = performance.now();
    if (this.reduceDirty && now - this.lastReduceAt >= SCORE_INTERVAL_MS && compositor.requestReduction()) {
      this.reduceDirty = false;
      this.lastReduceAt = now;
    }
    // Keep looking until the read-back has landed and nothing is waiting for a new one.
    if ((this.reduceDirty || compositor.reductionBusy) && !this.reducePollRequest) {
      this.reducePollRequest = requestAnimationFrame(() => {
        this.reducePollRequest = 0;
        if (this.compositor) this.maintainReduction(this.compositor);
      });
    }
  }

  /** Sends the work's score to the UI, at most about four times a second. */
  private emitScoreSoon(): void {
    if (this.scoreTimer) return;
    const wait = Math.max(0, SCORE_INTERVAL_MS - (performance.now() - this.lastScoreAt));
    this.scoreTimer = window.setTimeout(() => {
      this.scoreTimer = 0;
      this.lastScoreAt = performance.now();
      this.events.emit("score", this.scoreBook.work(this.history.total));
    }, wait);
  }

  /** Turns the hits recorded since the last frame into needle dots and stamps them in one go. */
  private flushStamps(compositor: Compositor): void {
    let hits: readonly Hit[] = this.pendingHits;
    if (this.restamp) {
      hits = this.history.allStrokes().flatMap((stroke) => strokeHits(stroke));
      this.restamp = false;
    }
    if (hits.length === 0) return;
    this.stampHits(compositor, hits);
    this.pendingHits.length = 0;
  }

  /** Plans the dots of the hits and stamps them, a chunk at a time. */
  private stampHits(compositor: Compositor, hits: readonly Hit[]): void {
    const started = performance.now();
    let dots = 0;
    for (let i = 0; i < hits.length; i += STAMP_CHUNK_HITS) {
      const batch = this.planner.plan(hits, i, Math.min(hits.length, i + STAMP_CHUNK_HITS));
      compositor.stamp(batch);
      dots += batch.ink.count;
    }
    this.lastStampMs = performance.now() - started;
    this.lastBatchDots = dots;
    this.dotsStamped += dots;
    this.reduceDirty = true;
  }

  /** Debug: hashes of the ink and trauma buffers as they are right now. */
  getBufferHash(): { ink: string; trauma: string } | null {
    const compositor = this.compositor;
    if (!compositor) return null;
    this.flushStamps(compositor);
    return compositor.hashBuffers();
  }

  private readonly render = (): void => {
    this.frameRequest = 0;
    const { canvas, gl, compositor } = this;
    const stage = this.stageSize();
    if (!canvas || !gl || !compositor || !stage) return;

    const started = performance.now();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(stage.width * dpr);
    const height = Math.round(stage.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    if (this.skinDirty) {
      compositor.setSkinTone(parseHex(this.skinHex));
      this.skinDirty = false;
    }

    this.gpuTimer?.poll();
    this.gpuTimer?.begin();
    this.flushStamps(compositor);
    this.emitInkState();
    this.maintainReduction(compositor);
    compositor.prepareFrame();

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    compositor.draw(this.view, stage, {
      healed: this.renderMode === "healed",
      showTrauma: this.debugOptions.showTraumaHeatmap,
      stencil: this.stencilToDraw(),
    });
    if (this.options.debug) {
      if (this.debugOptions.showHitCentres || this.debugOptions.showDeviationHeatmap) {
        compositor.drawHitDots(this.hitLog, this.view, stage, this.debugOptions.showDeviationHeatmap);
      }
      if (this.cursorScreen) {
        const mm = screenToSheetMm(
          this.cursorScreen.x,
          this.cursorScreen.y,
          this.view,
          stage,
        );
        compositor.drawMarker(mm, this.view, stage);
      }
    }

    this.gpuTimer?.end();
    const finished = performance.now();
    this.lastRenderMs = finished - started;
    this.renderStamps.push(finished);
    while (
      this.renderStamps.length > 0 &&
      finished - (this.renderStamps[0] ?? finished) > STATS_WINDOW_MS
    ) {
      this.renderStamps.shift();
    }
  };
}
