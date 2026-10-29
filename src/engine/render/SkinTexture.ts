import * as twgl from "twgl.js";
import { BUFFER_TEXELS, SHEET_MM } from "../constants";
import { skinFrag, skinVert } from "../shaders";

/** Procedural skin, regenerated on the GPU whenever the tone changes. RGBA8 with mipmaps. */
export class SkinTexture {
  readonly texture: WebGLTexture;
  private readonly framebuffer: WebGLFramebuffer;
  private readonly programInfo: twgl.ProgramInfo;
  private readonly quad: twgl.BufferInfo;
  private readonly gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext, quad: twgl.BufferInfo) {
    this.gl = gl;
    this.quad = quad;
    this.programInfo = twgl.createProgramInfo(gl, [skinVert, skinFrag]);

    const { width, height } = BUFFER_TEXELS;
    const levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer)
      throw new Error("Could not allocate the skin texture");
    this.texture = texture;
    this.framebuffer = framebuffer;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, width, height);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Redraws the whole texture for a tone. The caller must reset the viewport afterwards. */
  generate(tone: [number, number, number]): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, BUFFER_TEXELS.width, BUFFER_TEXELS.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.programInfo.program);
    twgl.setBuffersAndAttributes(gl, this.programInfo, this.quad);
    twgl.setUniforms(this.programInfo, {
      u_tone: tone,
      u_sizeMm: [SHEET_MM.width, SHEET_MM.height],
    });
    twgl.drawBufferInfo(gl, this.quad, gl.TRIANGLE_STRIP);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteProgram(this.programInfo.program);
  }
}
