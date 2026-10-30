import { auth } from "../../lib/firebase";
import { maskToPng } from "../stencil/rebuildStencil";
import type { SketchRef } from "../../store/workspaceStore";
import { workSync } from "./workServices";
import { localKey } from "./workTypes";

export interface TransferredSketch {
  file: File;
  mask: ImageBitmap;
  threshold: number;
  lineWeightPx: number;
  removeFills: boolean;
  heightCm: number;
}

/**
 * Keeps the sketch and its stencil on the device when a stencil is transferred; they reach
 * Storage with the next save of the work. Without a signed-in user nothing is kept and the
 * stencil simply works for this visit.
 */
export async function registerSketch(sketch: TransferredSketch): Promise<SketchRef> {
  const ref: SketchRef = { id: crypto.randomUUID(), heightCm: sketch.heightCm };
  const uid = auth.currentUser?.uid;
  if (!uid) return ref;
  try {
    await workSync.saveSketch({
      key: localKey(uid, ref.id),
      uid,
      sketchId: ref.id,
      fileName: sketch.file.name,
      original: sketch.file,
      originalType: sketch.file.type,
      stencil: await maskToPng(sketch.mask),
      threshold: sketch.threshold,
      lineWeightPx: sketch.lineWeightPx,
      removeFills: sketch.removeFills,
      createdAtMs: Date.now(),
      synced: false,
    });
  } catch {
    // The device could not keep it (storage full or blocked); the work then saves without it.
  }
  return ref;
}
