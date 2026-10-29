import * as twgl from "twgl.js";
import { BUFFER_TEXELS, SHEET_MM } from "../constants";
import { stampVert, traumaFrag } from "../shaders";
import { DotInstances } from "./DotInstances";

/**
 * The trauma buffer: R16F, additive. Every needle dot adds to it, with or without ink, so
 * a needle that keeps hitting one spot keeps raising the trauma there. Values can exceed 1.
 */
export class TraumaBuffer {
  readonly texture: WebGLTexture;
  private readonly gl: WebGL2RenderingContext;
  private readonly framebuffer: WebGLFramebuffer;
  private readonly programInfo: twgl.ProgramInfo;
  private readonly dots: DotInstances;
  private mipmapsStale = false;

  constructor(gl: WebGL2RenderingContext, quad: twgl.BufferInfo) {
    this.gl = gl;
    this.programInfo = twgl.createProgramInfo(gl, [stampVert, traumaFrag]);

    const { width, height } = BUFFER_TEXELS;
    const mipLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Could not allocate the trauma buffer");
    this.texture = texture;
    this.framebuffer = framebuffer;
    this.dots = new DotInstances(gl, quad);

    // Mipmapped: the composite blurs the trauma by reading a higher level.
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, mipLevels, gl.R16F, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) throw new Error("The trauma buffer cannot be rendered to (R16F)");
    this.clear();
  }

  /** Adds dots to the buffer with one instanced draw per batch. */
  stamp(data: Float32Array, count: number): void {
    if (count <= 0) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, BUFFER_TEXELS.width, BUFFER_TEXELS.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive
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

  updateMipmaps(): void {
    if (!this.mipmapsStale) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.mipmapsStale = false;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteProgram(this.programInfo.program);
    this.dots.dispose();
  }
}
