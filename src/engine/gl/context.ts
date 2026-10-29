import type { UnsupportedReason } from "../types";

export type ContextResult =
  | { gl: WebGL2RenderingContext; error?: undefined }
  | { gl?: undefined; error: UnsupportedReason };

/** Creates the WebGL2 context and checks the extensions the engine relies on. */
export function createContext(
  canvas: HTMLCanvasElement,
  debug: boolean,
): ContextResult {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    // Lets debug tooling read the canvas back after a frame has been presented.
    preserveDrawingBuffer: debug,
  });
  if (!gl) return { error: "webgl2" };
  // Needed to render into RGBA16F / R16F (ink and trauma buffers).
  if (!gl.getExtension("EXT_color_buffer_float"))
    return { error: "float-render-targets" };
  return { gl };
}

/** "#e6c3a7" → [r, g, b] in 0–1 (sRGB values, as written). */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
