import * as twgl from "twgl.js";
import { DOT_FLOATS } from "../brushes/stampPlan";

/** Dots per instanced draw. A frame normally needs one draw; bigger batches (replays) are split. */
const MAX_DOTS_PER_DRAW = 1 << 16;
const BYTES_PER_DOT = DOT_FLOATS * 4;

/**
 * One interleaved instance buffer of dots (x, y, radius, amount | level) drawn as quads with
 * a program of the caller's choice: one instanced draw per MAX_DOTS_PER_DRAW dots.
 */
export class DotInstances {
  private readonly gl: WebGL2RenderingContext;
  private readonly buffer: WebGLBuffer;
  private readonly bufferInfo: twgl.BufferInfo;

  constructor(gl: WebGL2RenderingContext, quad: twgl.BufferInfo) {
    this.gl = gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Could not allocate a dot buffer");
    this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_DOTS_PER_DRAW * BYTES_PER_DOT, gl.DYNAMIC_DRAW);
    const corner = quad.attribs?.a_corner;
    if (!corner) throw new Error("Missing quad attribute");
    this.bufferInfo = {
      numElements: 4,
      attribs: {
        a_corner: corner,
        a_dot: { buffer, numComponents: 4, type: gl.FLOAT, stride: BYTES_PER_DOT, offset: 0, divisor: 1 },
        a_level: { buffer, numComponents: 1, type: gl.FLOAT, stride: BYTES_PER_DOT, offset: 16, divisor: 1 },
      },
    };
  }

  /** The program, its uniforms, the target and the blend state are set by the caller. */
  draw(programInfo: twgl.ProgramInfo, data: Float32Array, count: number): void {
    const gl = this.gl;
    for (let start = 0; start < count; start += MAX_DOTS_PER_DRAW) {
      const n = Math.min(MAX_DOTS_PER_DRAW, count - start);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, MAX_DOTS_PER_DRAW * BYTES_PER_DOT, gl.DYNAMIC_DRAW); // orphan
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(start * DOT_FLOATS, (start + n) * DOT_FLOATS));
      twgl.setBuffersAndAttributes(gl, programInfo, this.bufferInfo);
      twgl.drawBufferInfo(gl, this.bufferInfo, gl.TRIANGLE_STRIP, 4, 0, n);
    }
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buffer);
  }
}
