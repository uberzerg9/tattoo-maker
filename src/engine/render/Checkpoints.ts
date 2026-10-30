import { BUFFER_TEXELS } from "../constants";

/** One checkpoint on the GPU: copies of the ink levels, the total ink and the trauma. */
export interface CheckpointSlot {
  readonly framebuffer: WebGLFramebuffer;
  readonly textures: readonly [WebGLTexture, WebGLTexture, WebGLTexture];
}

/** A framebuffer attachment to copy from or to. */
export interface CopySource {
  framebuffer: WebGLFramebuffer;
  /** Colour attachment index. */
  attachment: number;
}

const FORMATS = ["RGBA16F", "R16F", "R16F"] as const;

/**
 * Pool of full-size copies of the ink and trauma buffers (~38 MB each, no mip levels). Slots
 * are made on demand and reused when a checkpoint is dropped, so memory stops growing once
 * the most checkpoints that are ever kept exist.
 */
export class CheckpointPool {
  private readonly gl: WebGL2RenderingContext;
  private readonly free: CheckpointSlot[] = [];
  private readonly all: CheckpointSlot[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  get allocated(): number {
    return this.all.length;
  }

  acquire(): CheckpointSlot {
    return this.free.pop() ?? this.create();
  }

  release(slot: CheckpointSlot): void {
    this.free.push(slot);
  }

  /** Copies live buffers into a slot: levels, total ink, trauma, in that order. */
  save(slot: CheckpointSlot, from: readonly [CopySource, CopySource, CopySource]): void {
    from.forEach((source, i) => this.copy(source, slot.textures[i]!));
  }

  /** Copies a slot back into the live textures. */
  restore(slot: CheckpointSlot, to: readonly [WebGLTexture, WebGLTexture, WebGLTexture]): void {
    to.forEach((texture, i) => this.copy({ framebuffer: slot.framebuffer, attachment: i }, texture));
  }

  dispose(): void {
    const gl = this.gl;
    for (const slot of this.all) {
      gl.deleteFramebuffer(slot.framebuffer);
      for (const texture of slot.textures) gl.deleteTexture(texture);
    }
    this.all.length = 0;
    this.free.length = 0;
  }

  /** GPU-side copy of the base level; nothing is read back. */
  private copy(source: CopySource, target: WebGLTexture): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source.framebuffer);
    gl.readBuffer(gl.COLOR_ATTACHMENT0 + source.attachment);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, BUFFER_TEXELS.width, BUFFER_TEXELS.height);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }

  private create(): CheckpointSlot {
    const gl = this.gl;
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error("Could not allocate an undo checkpoint");
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const textures = FORMATS.map((format, i) => {
      const texture = gl.createTexture();
      if (!texture) throw new Error("Could not allocate an undo checkpoint");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl[format], BUFFER_TEXELS.width, BUFFER_TEXELS.height);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texture, 0);
      return texture;
    }) as unknown as CheckpointSlot["textures"];
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) throw new Error("An undo checkpoint cannot be read back");
    const slot = { framebuffer, textures };
    this.all.push(slot);
    return slot;
  }
}

/** Two independent 32-bit multiply-xorshift lanes: 64 bits to tell two buffers apart in a debug check. */
export class BufferHasher {
  private a = 0x9e3779b1;
  private b = 0x85ebca6b;

  update(words: Uint32Array): void {
    let { a, b } = this;
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      a = Math.imul(a ^ w, 0xcc9e2d51);
      a ^= a >>> 15;
      b = Math.imul(b + w + i, 0x1b873593);
      b ^= b >>> 13;
      b = Math.imul(b, 0xe6546b64);
    }
    this.a = a;
    this.b = b;
  }

  digest(): string {
    const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
    return hex(this.a) + hex(this.b);
  }
}

/** Feeds one attachment into a hasher, read back in bands so the temporary array stays small. */
export function hashAttachment(gl: WebGL2RenderingContext, source: CopySource, hasher: BufferHasher): void {
  const BAND = 64;
  const { width, height } = BUFFER_TEXELS;
  const floats = new Float32Array(width * BAND * 4);
  const words = new Uint32Array(floats.buffer);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source.framebuffer);
  gl.readBuffer(gl.COLOR_ATTACHMENT0 + source.attachment);
  for (let y = 0; y < height; y += BAND) {
    const rows = Math.min(BAND, height - y);
    gl.readPixels(0, y, width, rows, gl.RGBA, gl.FLOAT, floats);
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error(`Could not read the buffer back (GL error ${error})`);
    hasher.update(words.subarray(0, width * rows * 4));
  }
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
}
