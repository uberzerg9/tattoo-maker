import { describe, expect, it, vi } from "vitest";
import { detectWebGlSupport } from "./webglSupport";

const COMPLETE = 36053;

/** A WebGL2 stand-in; `renderable` says which float formats can be rendered to. */
function fakeGl(options: { floatExtension?: boolean; renderable?: string[]; throwOnStorage?: boolean } = {}) {
  const { floatExtension = true, renderable = ["RGBA16F", "R16F"], throwOnStorage = false } = options;
  let format = "";
  const loseContext = vi.fn();
  const gl = {
    TEXTURE_2D: 3553, FRAMEBUFFER: 36160, COLOR_ATTACHMENT0: 36064, FRAMEBUFFER_COMPLETE: COMPLETE,
    RGBA16F: "RGBA16F", R16F: "R16F",
    getExtension: (name: string) => (name === "EXT_color_buffer_float" ? (floatExtension ? {} : null) : name === "WEBGL_lose_context" ? { loseContext } : null),
    createTexture: () => ({}), createFramebuffer: () => ({}), bindTexture: () => undefined, bindFramebuffer: () => undefined,
    texStorage2D: (_t: number, _l: number, f: string) => {
      if (throwOnStorage) throw new Error("INVALID_ENUM");
      format = f;
    },
    framebufferTexture2D: () => undefined,
    checkFramebufferStatus: () => (renderable.includes(format) ? COMPLETE : 36054),
    deleteFramebuffer: () => undefined, deleteTexture: () => undefined,
  };
  return { gl, loseContext };
}

const canvasWith = (gl: unknown) => (() => ({ getContext: () => gl }) as unknown as HTMLCanvasElement);

describe("detectWebGlSupport", () => {
  it("is fine when WebGL 2, the float extension and both render targets exist", () => {
    expect(detectWebGlSupport(canvasWith(fakeGl().gl))).toBeNull();
  });

  it("says webgl2 when the browser gives no WebGL 2 context", () => {
    expect(detectWebGlSupport(canvasWith(null))).toBe("webgl2");
  });

  it("says webgl2 when asking for a context throws", () => {
    expect(detectWebGlSupport(() => { throw new Error("blocked"); })).toBe("webgl2");
  });

  it("says float-render-targets when the extension is missing", () => {
    expect(detectWebGlSupport(canvasWith(fakeGl({ floatExtension: false }).gl))).toBe("float-render-targets");
  });

  it("says float-render-targets when the extension exists but a buffer cannot be rendered to", () => {
    expect(detectWebGlSupport(canvasWith(fakeGl({ renderable: ["RGBA16F"] }).gl))).toBe("float-render-targets"); // no R16F
    expect(detectWebGlSupport(canvasWith(fakeGl({ renderable: ["R16F"] }).gl))).toBe("float-render-targets"); // no RGBA16F
    expect(detectWebGlSupport(canvasWith(fakeGl({ throwOnStorage: true }).gl))).toBe("float-render-targets");
  });

  it("gives its context back so the engine's own is not the 17th", () => {
    const { gl, loseContext } = fakeGl();
    detectWebGlSupport(canvasWith(gl));
    expect(loseContext).toHaveBeenCalledTimes(1);
  });
});
