import { createContext, parseHex } from "./gl/context";
import { depthFromPointer } from "./hit";
import type { Hit } from "./hit";
import { HitLog } from "./hitLog";
import { StampPlanner } from "./brushes/stampPlan";
import { CAP_ORDER, INK_TONE, InkSupply } from "./ink";
import { HitScheduler, insideSheet } from "./input/hitScheduler";
import type { StrokeContext, StrokeSample } from "./input/hitScheduler";
import { bundledPresets } from "./presets";
import type { PresetBundle } from "./presets";
import { Compositor } from "./render/Compositor";
import type { StencilDraw } from "./render/Compositor";
import { GpuTimer } from "./render/GpuTimer";
import type {
  CartridgeId,
  DebugOptions,
  DebugStats,
  EngineEvents,
  EngineOptions,
  EngineView,
  InkCapId,
  RenderMode,
  StencilPlacement,
  TattooEngine,
} from "./types";
import { defaultPlacement, clampPlacement, stencilSizeMm } from "./stencil";
import { Emitter } from "./util/emitter";
import { DEFAULT_VIEW, screenToSheetMm } from "./view";
import type { StencilSize } from "./stencil";
import type { Point, Size } from "./view";

const DEFAULT_SKIN_HEX = "#e6c3a7";
const DEFAULT_MACHINE_HZ = 85;
const STATS_WINDOW_MS = 1000;
/** Hits stamped per planning chunk; at 15 needles each this stays under one instanced draw. */
const STAMP_CHUNK_HITS = 4000;

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

  private readonly hitLog = new HitLog();
  /** Hits recorded since the last frame; stamped into the ink buffer by the next render. */
  private readonly pendingHits: Hit[] = [];
  /** Replay the whole hit log into a fresh ink buffer (after a lost context). */
  private restamp = false;
  private stroke: ActiveStroke | null = null;
  private nextStrokeId = 1;
  private tickRequest = 0;

  private debugOptions: DebugOptions = {
    showHitCentres: false,
    showTraumaHeatmap: false,
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
    if (this.supply.dip(this.cartridgeId, this.inkCap)) this.emitInkState();
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
   * raster, the distance in mm to the nearest line centre. The stencil can be moved until the
   * first stroke after this call; replacing it unlocks again.
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
    this.setStencilLocked(false);
    this.requestRender();
  }

  setStencilPlacement(placement: StencilPlacement): void {
    if (!this.stencil || this.stencilLocked) return;
    this.stencilPlacement = clampPlacement(placement, this.stencil.size);
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

  // Milestone 7.
  undo(): void {}
  snapshot(): Promise<{ ink: Blob; trauma: Blob; preview: Blob }> {
    return Promise.reject(new Error("snapshot() is not implemented yet"));
  }
  restore(s: { ink: Blob; trauma: Blob }): Promise<void> {
    void s;
    return Promise.reject(new Error("restore() is not implemented yet"));
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
    this.pendingHits.length = 0;
    this.compositor?.clearBuffers();
    this.lastSpacingMm = null;
    this.lastDepth = null;
    if (this.stroke) this.stroke.lastHit = null;
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
      hitCount: this.hitLog.strokes.reduce((n, s) => n + s.hits.length, 0),
      strokeCount: this.hitLog.strokes.length,
      stampMs: this.lastStampMs,
      lastBatchDots: this.lastBatchDots,
      dotsStamped: this.dotsStamped,
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
    const sample = this.sampleFrom(e);
    if (!sample) return;
    this.setStencilLocked(true); // the first stroke fixes the stencil where it is
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
    this.requestRender();
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
    this.supply.apply(hits);
    this.hitLog.add(stroke.id, hits);
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
    this.restamp = true;
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

  /** Turns the hits recorded since the last frame into needle dots and stamps them in one go. */
  private flushStamps(compositor: Compositor): void {
    let hits: readonly Hit[] = this.pendingHits;
    if (this.restamp) {
      hits = this.hitLog.strokes.flatMap((stroke) => stroke.hits);
      this.restamp = false;
    }
    if (hits.length === 0) return;

    const started = performance.now();
    let dots = 0;
    for (let i = 0; i < hits.length; i += STAMP_CHUNK_HITS) {
      const batch = this.planner.plan(hits, i, Math.min(hits.length, i + STAMP_CHUNK_HITS));
      compositor.stamp(batch);
      dots += batch.ink.count;
    }
    this.pendingHits.length = 0;
    this.lastStampMs = performance.now() - started;
    this.lastBatchDots = dots;
    this.dotsStamped += dots;
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
      if (this.debugOptions.showHitCentres)
        compositor.drawHitDots(this.hitLog, this.view, stage);
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
