import { createContext } from "../../engine/gl/context";
import type { UnsupportedReason } from "../../engine/types";

/** What the ink and skin-trauma buffers are stored as: both must be renderable. */
const RENDER_TARGET_FORMATS = ["RGBA16F", "R16F"] as const;

function canRenderTo(gl: WebGL2RenderingContext, format: (typeof RENDER_TARGET_FORMATS)[number]): boolean {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl[format], 4, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  } catch {
    return false;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
  }
}

/**
 * Asks the browser what the engine will ask for, before the engine is downloaded: WebGL 2, the
 * float-buffer extension, and a really renderable RGBA16F / R16F target. Null means it can run.
 */
export function detectWebGlSupport(makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): UnsupportedReason | null {
  let gl: WebGL2RenderingContext | undefined;
  try {
    const result = createContext(makeCanvas(), false);
    if (result.error) return result.error;
    gl = result.gl;
    return RENDER_TARGET_FORMATS.every((format) => canRenderTo(gl!, format)) ? null : "float-render-targets";
  } catch {
    return "webgl2";
  } finally {
    // This context was only a question; give it back before the engine makes its own.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
