import * as twgl from "twgl.js";
import { reduceFrag, skinVert } from "../shaders";
import { INKED_DENSITY, REDUCE_CELLS } from "../scoring/trauma";

const FLOATS = REDUCE_CELLS.width * REDUCE_CELLS.height * 4;

/**
 * Shrinks the ink and trauma buffers to a 64 x 48 grid of counts on the GPU and reads that
 * back without waiting: the read goes into a pixel buffer, a fence says when it is done, and
 * poll() only looks at the fence. A frame never blocks on it.
 */
export class ScoreReducer {
  private readonly gl: WebGL2RenderingContext;
  private readonly quad: twgl.BufferInfo;
  private readonly programInfo: twgl.ProgramInfo;
  private readonly texture: WebGLTexture;
  private readonly framebuffer: WebGLFramebuffer;
  /** Two buffers, used in turn: the one being read is never the one the GPU writes next. */
  private readonly pixelBuffers: WebGLBuffer[] = [];
  private writing = 0;
  private readonly result = new Float32Array(FLOATS);
  private fence: WebGLSync | null = null;

  constructor(gl: WebGL2RenderingContext, quad: twgl.BufferInfo) {
    this.gl = gl;
    this.quad = quad;
    this.programInfo = twgl.createProgramInfo(gl, [skinVert, reduceFrag]);

    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Could not allocate the score reducer");
    this.texture = texture;
    this.framebuffer = framebuffer;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, REDUCE_CELLS.width, REDUCE_CELLS.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) throw new Error("The score reducer cannot be rendered to (RGBA16F)");

    for (let i = 0; i < 2; i++) {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("Could not allocate the score reducer");
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, FLOATS * 4, gl.STREAM_READ);
      this.pixelBuffers.push(buffer);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }

  /** True while a read-back has been asked for and not collected. */
  get busy(): boolean {
    return this.fence !== null;
  }

  /**
   * Runs the reduction and starts the read-back. Does nothing, returning false, while the
   * previous one is still in flight.
   */
  request(inkTotal: WebGLTexture, trauma: WebGLTexture, overworkThreshold: number): boolean {
    if (this.fence) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, REDUCE_CELLS.width, REDUCE_CELLS.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.programInfo.program);
    twgl.setBuffersAndAttributes(gl, this.programInfo, this.quad);
    twgl.setUniforms(this.programInfo, {
      u_inkTotal: inkTotal,
      u_trauma: trauma,
      u_inked: INKED_DENSITY,
      u_overwork: overworkThreshold,
    });
    twgl.drawBufferInfo(gl, this.quad, gl.TRIANGLE_STRIP);

    this.writing = 1 - this.writing;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pixelBuffers[this.writing]!);
    gl.readPixels(0, 0, REDUCE_CELLS.width, REDUCE_CELLS.height, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    return true;
  }

  /** The finished reduction (RGBA floats per cell), or null if it is not ready yet. Never blocks. */
  poll(): Float32Array | null {
    const gl = this.gl;
    if (!this.fence) return null;
    const status = gl.clientWaitSync(this.fence, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED) return null;
    gl.deleteSync(this.fence);
    this.fence = null;
    if (status === gl.WAIT_FAILED) return null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pixelBuffers[this.writing]!);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.result);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return this.result;
  }

  dispose(): void {
    const gl = this.gl;
    if (this.fence) gl.deleteSync(this.fence);
    gl.deleteTexture(this.texture);
    gl.deleteFramebuffer(this.framebuffer);
    for (const buffer of this.pixelBuffers) gl.deleteBuffer(buffer);
    gl.deleteProgram(this.programInfo.program);
  }
}
