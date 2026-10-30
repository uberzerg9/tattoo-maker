import * as twgl from "twgl.js";
import { CSS_PX_PER_MM } from "../constants";
import { HIT_LOG_CAPACITY } from "../hitLog";
import { OFF_STENCIL_MM } from "../scoring/deviation";
import { hitFrag, hitVert } from "../shaders";

/** Debug dot size: roughly a needle point, so dots visibly merge once spacing drops below it. */
const DOT_RADIUS_MM = 0.3;
const QUAD_SCALE = 1.4;

/** Draws every recorded hit centre as a small dot (debug only). One instanced draw call. */
export class HitDots {
  private readonly gl: WebGL2RenderingContext;
  private readonly programInfo: twgl.ProgramInfo;
  private readonly bufferInfo: twgl.BufferInfo;
  private readonly hitBuffer: WebGLBuffer;
  private readonly deviationBuffer: WebGLBuffer;
  /** How many hits are already on the GPU. */
  private uploaded = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.programInfo = twgl.createProgramInfo(gl, [hitVert, hitFrag]);
    this.bufferInfo = twgl.createBufferInfoFromArrays(gl, {
      a_corner: { numComponents: 2, data: [0, 0, 1, 0, 0, 1, 1, 1] },
      a_hit: {
        numComponents: 2,
        data: new Float32Array(HIT_LOG_CAPACITY * 2),
        divisor: 1,
        drawType: gl.DYNAMIC_DRAW,
      },
      a_dev: {
        numComponents: 1,
        data: new Float32Array(HIT_LOG_CAPACITY),
        divisor: 1,
        drawType: gl.DYNAMIC_DRAW,
      },
    });
    const buffer = this.bufferInfo.attribs?.a_hit?.buffer;
    const deviationBuffer = this.bufferInfo.attribs?.a_dev?.buffer;
    if (!buffer || !deviationBuffer) throw new Error("Could not allocate the hit buffer");
    this.hitBuffer = buffer;
    this.deviationBuffer = deviationBuffer;
  }

  /** Uploads hits added since the last call. `count` below `uploaded` means the log was cleared. */
  sync(positions: Float32Array, deviations: Float32Array, count: number): void {
    const gl = this.gl;
    if (count < this.uploaded) this.uploaded = 0;
    if (count > this.uploaded) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.hitBuffer);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        this.uploaded * 2 * 4,
        positions.subarray(this.uploaded * 2, count * 2),
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, this.deviationBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, this.uploaded * 4, deviations.subarray(this.uploaded, count));
      this.uploaded = count;
    }
  }

  /** `byDeviation` colours each dot by its distance to the stencil instead of one flat colour. */
  draw(viewUniforms: Record<string, unknown>, byDeviation = false): void {
    if (this.uploaded === 0) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.programInfo.program);
    twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);
    twgl.setUniforms(this.programInfo, {
      ...viewUniforms,
      u_pxPerMm: CSS_PX_PER_MM,
      u_radiusPx: DOT_RADIUS_MM * CSS_PX_PER_MM,
      u_quadScale: QUAD_SCALE,
      u_byDeviation: byDeviation ? 1 : 0,
      u_deviationRange: OFF_STENCIL_MM,
    });
    twgl.drawBufferInfo(
      gl,
      this.bufferInfo,
      gl.TRIANGLE_STRIP,
      4,
      0,
      this.uploaded,
    );
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.programInfo.program);
    for (const attrib of Object.values(this.bufferInfo.attribs ?? {}))
      gl.deleteBuffer(attrib.buffer);
  }
}
