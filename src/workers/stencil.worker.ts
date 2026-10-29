import { TEXELS_PER_MM } from "../engine/constants";
import { loadCv } from "./loadCv";
import { PREVIEW_TEXELS_PER_MM } from "./stencilProtocol";
import type { StencilRequest, StencilResponse, StencilSettings } from "./stencilProtocol";
import { buildStencil, rgbaToGray } from "./stencilPipeline";
import type { GrayImage } from "./stencilPipeline";

/**
 * OpenCV work for the Stencil transfer dialog, off the UI thread. The worker only exists while
 * the dialog is in use, so the several megabytes of OpenCV.js load on demand.
 */
const scope = self as unknown as {
  postMessage(message: StencilResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<StencilRequest>) => void) | null;
};

const cvReady = loadCv();
cvReady.then(
  () => scope.postMessage({ type: "ready" }),
  (e: unknown) => scope.postMessage({ type: "error", id: 0, message: String(e) }),
);

let sketch: GrayImage | null = null;
let pendingPreview: Extract<StencilRequest, { type: "preview" }> | null = null;
let previewScheduled = false;

const post = (message: StencilResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);
const params = (s: StencilSettings, texelsPerMm: number, withDistance: boolean) => ({ ...s, texelsPerMm, withDistance });

async function load(id: number, bitmap: ImageBitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No 2D context in the worker");
  ctx.drawImage(bitmap, 0, 0);
  const { width, height } = bitmap;
  bitmap.close();
  sketch = { data: rgbaToGray(ctx.getImageData(0, 0, width, height).data, width, height), width, height };
  post({ type: "loaded", id, width, height });
}

async function preview(req: Extract<StencilRequest, { type: "preview" }>) {
  const cv = await cvReady;
  if (!sketch) throw new Error("No sketch loaded");
  const r = buildStencil(cv, sketch, params(req.settings, PREVIEW_TEXELS_PER_MM, false));
  post({ type: "preview", id: req.id, width: r.width, height: r.height, mask: r.mask }, [r.mask.buffer]);
}

async function final(req: Extract<StencilRequest, { type: "final" }>) {
  const cv = await cvReady;
  if (!sketch) throw new Error("No sketch loaded");
  const r = buildStencil(cv, sketch, params(req.settings, TEXELS_PER_MM, true));
  // The mask goes to the GPU as an image: grey, fully opaque, so nothing is premultiplied.
  const rgba = new Uint8ClampedArray(r.width * r.height * 4);
  for (let i = 0, p = 0; i < r.mask.length; i++, p += 4) {
    const v = r.mask[i]!;
    rgba[p] = v;
    rgba[p + 1] = v;
    rgba[p + 2] = v;
    rgba[p + 3] = 255;
  }
  const mask = await createImageBitmap(new ImageData(rgba, r.width, r.height), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const distanceMm = r.distanceMm!;
  post({ type: "final", id: req.id, width: r.width, height: r.height, mask, distanceMm }, [mask, distanceMm.buffer]);
}

/** Runs the newest queued preview. Slider drags queue many; only the last matters. */
function drainPreview() {
  previewScheduled = false;
  const req = pendingPreview;
  pendingPreview = null;
  if (!req) return;
  preview(req).catch((e: unknown) => post({ type: "error", id: req.id, message: String(e) }));
}

scope.onmessage = (e) => {
  const req = e.data;
  const fail = (id: number) => (err: unknown) => post({ type: "error", id, message: String(err) });
  if (req.type === "load") {
    load(req.id, req.bitmap).catch(fail(req.id));
  } else if (req.type === "preview") {
    pendingPreview = req;
    if (!previewScheduled) {
      previewScheduled = true;
      setTimeout(drainPreview, 0);
    }
  } else {
    final(req).catch(fail(req.id));
  }
};
