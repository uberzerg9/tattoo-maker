import cvModule from "@techstark/opencv-js";
import type { CV } from "./stencilPipeline";

/**
 * Resolves to the initialised OpenCV.js module. Depending on how the module is loaded the
 * default export is a Promise, a ready module, or a module that is still starting up.
 */
export async function loadCv(): Promise<CV> {
  const mod = cvModule as unknown as { Mat?: unknown; onRuntimeInitialized?: () => void };
  if (mod instanceof Promise) return (await mod) as unknown as CV;
  if (mod.Mat) return mod as unknown as CV;
  await new Promise<void>((resolve) => {
    mod.onRuntimeInitialized = () => resolve();
  });
  return mod as unknown as CV;
}
