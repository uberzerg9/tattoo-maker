import { decodeSketch } from "./stencilFile";
import { StencilWorker } from "./StencilWorker";
import type { FinalResult } from "./StencilWorker";

export interface StencilRecipe {
  threshold: number;
  lineWeightPx: number;
  removeFills: boolean;
  heightMm: number;
}

/**
 * Makes the stencil of a saved sketch again, with the settings it was transferred with. The
 * pipeline is deterministic, so the mask and distance field match the original transfer.
 */
export async function rebuildStencil(original: Blob, fileName: string, recipe: StencilRecipe): Promise<FinalResult> {
  const worker = new StencilWorker();
  try {
    await worker.ready();
    const bitmap = await decodeSketch(new File([original], fileName, { type: original.type }));
    await worker.load(bitmap);
    return await worker.final(recipe);
  } finally {
    worker.terminate();
  }
}

/** The stencil lines as a PNG, kept next to the sketch as a thumbnail. */
export async function maskToPng(mask: ImageBitmap): Promise<Blob> {
  const canvas = new OffscreenCanvas(mask.width, mask.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the stencil");
  ctx.drawImage(mask, 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}
