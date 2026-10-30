import { BUFFER_TEXELS } from "../constants";
import { floatsToHalves } from "../snapshot/half";
import type { CopySource } from "./Checkpoints";

/**
 * Reads one float16 attachment of a framebuffer as half-float bits. Browsers report
 * (RGBA|RED, HALF_FLOAT) as the native read format of RGBA16F and R16F, which is a straight
 * copy; anywhere else it falls back to reading float32 in bands and converting.
 */
export function readHalves(gl: WebGL2RenderingContext, source: CopySource, channels: 1 | 4): Uint16Array {
  const { width, height } = BUFFER_TEXELS;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source.framebuffer);
  gl.readBuffer(gl.COLOR_ATTACHMENT0 + source.attachment);
  const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) as number;
  const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) as number;
  const native = format === gl.RGBA ? 4 : format === gl.RED ? 1 : 0;
  const out = new Uint16Array(width * height * channels);

  if (type === gl.HALF_FLOAT && native > 0) {
    if (native === channels) {
      gl.readPixels(0, 0, width, height, format, type, out);
    } else {
      const wide = new Uint16Array(width * height * native);
      gl.readPixels(0, 0, width, height, format, type, wide);
      for (let i = 0; i < out.length; i++) out[i] = wide[i * native]!;
    }
  } else {
    const BAND = 64;
    const floats = new Float32Array(width * BAND * 4);
    for (let y = 0; y < height; y += BAND) {
      const rows = Math.min(BAND, height - y);
      gl.readPixels(0, y, width, rows, gl.RGBA, gl.FLOAT, floats);
      const band = floats.subarray(0, width * rows * 4);
      if (channels === 4) floatsToHalves(band, out, y * width * 4);
      else floatsToHalves(band, out, y * width, 4, 0);
    }
  }
  const error = gl.getError();
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  if (error !== gl.NO_ERROR) throw new Error(`Could not read the buffer back (GL error ${error})`);
  return out;
}

/** Uploads half-float bits into the base level of a float16 texture. Mip levels are the caller's job. */
export function writeHalves(gl: WebGL2RenderingContext, texture: WebGLTexture, data: Uint16Array, channels: 1 | 4): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    BUFFER_TEXELS.width,
    BUFFER_TEXELS.height,
    channels === 4 ? gl.RGBA : gl.RED,
    gl.HALF_FLOAT,
    data,
  );
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new Error(`Could not load the saved buffer (GL error ${error})`);
}

/** Straight-alpha RGBA, top row first, from premultiplied bottom-up GPU rows. */
export function toImageRows(premultiplied: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    const dst = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = src + x * 4;
      const a = premultiplied[i + 3]!;
      const k = a === 0 ? 0 : 255 / a;
      out[dst + x * 4] = premultiplied[i]! * k;
      out[dst + x * 4 + 1] = premultiplied[i + 1]! * k;
      out[dst + x * 4 + 2] = premultiplied[i + 2]! * k;
      out[dst + x * 4 + 3] = a;
    }
  }
  return out;
}
