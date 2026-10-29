import type { PresetBundle } from "./presets/schema";

export type CartridgeId = "rl-3" | "rl-7" | "rs-9" | "m1-7" | "rm-15";
export type InkCapId = "black" | "g60" | "g30" | "g10" | "white";
export type RenderMode = "fresh" | "healed";
export type TraumaLevel = "low" | "medium" | "high";

/** Zoom / pan / rotation of the sheet inside the stage. Owned by the UI store. */
export interface EngineView {
  zoom: number;
  /** CSS px from the stage centre to the sheet centre. */
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
}

/** Where a stencil sits on the sheet: its centre in mm, rotation clockwise, and scale. */
export interface StencilPlacement {
  centerXMm: number;
  centerYMm: number;
  rotationDeg: number;
  scale: number;
}

export interface Score {
  passes: number;
  /** Mean distance to the stencil in mm; null until a liner has hit near a stencil line. */
  deviationMm: number | null;
  traumaLevel: TraumaLevel;
}

/** Why the engine cannot run in this browser. */
export type UnsupportedReason = "webgl2" | "float-render-targets";

export interface EngineEvents {
  score: Score;
  /** Ink in the cartridge, 0–1. */
  inkLevel: number;
  /** Ink left in each cap, 0–1. */
  capLevels: Record<InkCapId, number>;
  unsupported: UnsupportedReason;
  /** True when the work has changes that are not saved yet. */
  dirty: boolean;
  /** A stencil can be moved until the first stroke after it was transferred; then it locks. */
  stencilLocked: boolean;
}

export interface DebugStats {
  /** Frames actually rendered during the last second; 0 while idle. */
  framesPerSecond: number;
  /** CPU time of the last render call, ms. */
  renderMs: number;
  /** Cursor in sheet mm, null while the pointer is outside the canvas. */
  cursorMm: { x: number; y: number } | null;
  /** Hits recorded during the last second. */
  hitsPerSecond: number;
  /** Smoothed hand speed in mm/s while a stroke is active, otherwise 0. */
  handSpeedMmS: number;
  /** Distance between the last two hits of a stroke, mm; null before the second hit. */
  lastSpacingMm: number | null;
  /** Depth of the last hit, 0..1; null before the first hit. */
  lastDepth: number | null;
  hitCount: number;
  strokeCount: number;
  /** CPU time to turn the last frame's hits into dots and stamp them, ms. */
  stampMs: number;
  /** Needle dots in the last non-empty stamp batch. */
  lastBatchDots: number;
  /** Ink dots stamped since the engine started, halos included. */
  dotsStamped: number;
  /** Ink in the current cartridge, 0..1, and its tone (0 black … 1 white). */
  inkLevel: number;
  inkTone: number;
  /** GPU time of the last measured frame, ms; null where the browser has no timer queries. */
  gpuMs: number | null;
}

export interface DebugOptions {
  /** Draw a dot at the centre of every hit. */
  showHitCentres: boolean;
  /** Show the raw trauma buffer as a heatmap (yellow = the overwork threshold). */
  showTraumaHeatmap: boolean;
  /** Replace the depth of every hit with this value (0..1); null uses the pointer. */
  depthOverride: number | null;
}

export interface EngineOptions {
  /** Draws debug helpers and collects DebugStats. */
  debug?: boolean;
  /** Cartridge presets; the bundled cartridges.json is used when omitted. */
  presets?: PresetBundle;
  /** Tuning aids for debug sessions. */
  tuning?: {
    /** Scales the width of every needle dot; 1 = one needle wide. */
    dotScale?: number;
  };
}

/** The only contract between the UI and the engine. */
export interface TattooEngine {
  mount(canvas: HTMLCanvasElement): void;
  destroy(): void;
  setCartridge(id: CartridgeId): void;
  /** Takes effect on the next dip(). */
  setInk(capId: InkCapId): void;
  dip(): void;
  setMachineHz(hz: number): void;
  setSkinTone(hex: string): void;
  setView(view: EngineView): void;
  setStencil(mask: ImageBitmap, distanceField: Float32Array): void;
  /** Moves / rotates / scales the stencil. Ignored once it is locked by a stroke. */
  setStencilPlacement(placement: StencilPlacement): void;
  setStencilVisibility(visible: boolean, opacity: number): void;
  setRenderMode(mode: RenderMode): void;
  /** The UI forwards raw pointer events while the needle tool is active. */
  pointer(e: PointerEvent): void;
  undo(): void;
  snapshot(): Promise<{ ink: Blob; trauma: Blob; preview: Blob }>;
  restore(s: { ink: Blob; trauma: Blob }): Promise<void>;
  on<K extends keyof EngineEvents>(
    event: K,
    cb: (payload: EngineEvents[K]) => void,
  ): () => void;
  getDebugStats(): DebugStats;
  setDebugOptions(options: Partial<DebugOptions>): void;
  /** Debug aid: forgets every recorded hit. Real undo arrives with milestone 7. */
  clearHits(): void;
}
