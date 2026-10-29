import * as twgl from "twgl.js";
import { BUFFER_TEXELS, SHEET_MM } from "../constants";
import { stampFrag, stampVert } from "../shaders";
import { DotInstances } from "./DotInstances";

function createTexture(gl: WebGL2RenderingContext, format: number, levels: number): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Could not allocate an ink texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, levels, format, BUFFER_TEXELS.width, BUFFER_TEXELS.height);
  // Mipmapped so the sheet stays clean when it is shown smaller than the buffer.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/**
 * The ink buffer. Ink is kept as cumulative densities (see inkModel.ts):
 *  - `levels`, RGBA16F: density of ink at least as dark as black / grey 60 / grey 30 / grey 10
 *  - `total`, R16F: density of all ink, white included
 * Needle dots are stamped into both with one instanced draw, blended with
 * (ONE, ONE_MINUS_SRC_COLOR), so each channel saturates towards 1 and never exceeds it.
 */
export class InkBuffer {
  readonly levelsTexture: WebGLTexture;
  readonly totalTexture: WebGLTexture;
  private readonly gl: WebGL2RenderingContext;
  private readonly framebuffer: WebGLFramebuffer;
  private readonly programInfo: twgl.ProgramInfo;
  private readonly dots: DotInstances;
  private mipmapsStale = false;

  constructor(gl: WebGL2RenderingContext, quad: twgl.BufferInfo) {
    this.gl = gl;
    this.programInfo = twgl.createProgramInfo(gl, [stampVert, stampFrag]);

    const { width, height } = BUFFER_TEXELS;
    const mipLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;
    this.levelsTexture = createTexture(gl, gl.RGBA16F, mipLevels);
    this.totalTexture = createTexture(gl, gl.R16F, mipLevels);
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error("Could not allocate the ink buffer");
    this.framebuffer = framebuffer;
    this.dots = new DotInstances(gl, quad);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.levelsTexture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.totalTexture, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) throw new Error("The ink buffer cannot be rendered to (RGBA16F + R16F)");

    this.clear();
  }

  /** Stamps dots into the buffer: one instanced draw per MAX_DOTS_PER_DRAW dots. */
  stamp(data: Float32Array, count: number): void {
    if (count <= 0) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, BUFFER_TEXELS.width, BUFFER_TEXELS.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    gl.useProgram(this.programInfo.program);
    twgl.setUniforms(this.programInfo, { u_sheetMm: [SHEET_MM.width, SHEET_MM.height] });

    this.dots.draw(this.programInfo, data, count);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.mipmapsStale = true;
  }

  clear(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.mipmapsStale = true;
  }

  /** Rebuilds the mip levels, only if something was stamped since the last time. */
  updateMipmaps(): void {
    if (!this.mipmapsStale) return;
    const gl = this.gl;
    for (const texture of [this.levelsTexture, this.totalTexture]) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    this.mipmapsStale = false;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.levelsTexture);
    gl.deleteTexture(this.totalTexture);
    gl.deleteFramebuffer(this.framebuffer);
    this.dots.dispose();
    gl.deleteProgram(this.programInfo.program);
  }
}
