/** Messages between the Stencil transfer dialog and stencil.worker.ts. */

/** The dialog's settings; sizes are physical, so previews and the final result match. */
export interface StencilSettings {
  /** 0–255, higher keeps less. */
  threshold: number;
  /** CSS px at 100% zoom. */
  lineWeightPx: number;
  removeFills: boolean;
  /** Height on the skin, mm. */
  heightMm: number;
}

export type StencilRequest =
  /** Hands the sketch over; the bitmap is transferred and the worker keeps its grey values. */
  | { type: "load"; id: number; bitmap: ImageBitmap }
  /** A cheap, low-resolution result for the live preview. Newer requests replace older ones. */
  | { type: "preview"; id: number; settings: StencilSettings }
  /** The real thing: full resolution mask and distance field. */
  | { type: "final"; id: number; settings: StencilSettings };

export type StencilResponse =
  | { type: "ready" }
  | { type: "loaded"; id: number; width: number; height: number }
  | { type: "preview"; id: number; width: number; height: number; mask: Uint8Array }
  | {
      type: "final";
      id: number;
      width: number;
      height: number;
      /** Lines in the red channel, ready for the GPU. */
      mask: ImageBitmap;
      /** Distance to the nearest line centre in mm, per mask texel. */
      distanceMm: Float32Array;
    }
  | { type: "error"; id: number; message: string };

/** Texels per mm of the live preview. The final result uses the engine's own. */
export const PREVIEW_TEXELS_PER_MM = 5.12;
