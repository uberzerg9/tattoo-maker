import * as twgl from "twgl.js";
import {
  SHEET_BORDER_PX,
  SHEET_MM,
  SHEET_BORDER_RGB,
  SHEET_CORNER_RADIUS_PX,
  SHEET_CSS_PX,
  SHEET_SHADOW_ALPHA,
  SHEET_SHADOW_OFFSET_PX,
  BUFFER_TEXELS,
  CSS_PX_PER_MM,
  STENCIL_RGB,
  TEXELS_PER_MM,
} from "../constants";
import type { StampBatch } from "../brushes/stampPlan";
import type { HitLog } from "../hitLog";
import type { PresetBundle } from "../presets";
import type { StencilSize } from "../stencil";
import type { StencilPlacement } from "../types";
import { WHITE_INK_RGB, inkTransmittance } from "../ink";
import { markerFrag, sheetFrag, sheetVert } from "../shaders";
import type { RawBuffers } from "../snapshot/format";
import type { Point, Size, View } from "../view";
import { readHalves, toImageRows, writeHalves } from "./BufferIO";
import { BufferHasher, CheckpointPool, hashAttachment } from "./Checkpoints";
import type { CheckpointSlot, CopySource } from "./Checkpoints";
import { HitDots } from "./HitDots";
import { InkBuffer } from "./InkBuffer";
import { ScoreReducer } from "./ScoreReducer";
import { SkinTexture } from "./SkinTexture";
import { StencilTexture } from "./StencilTexture";
import { TraumaBuffer } from "./TraumaBuffer";

const stencilRotation = (deg: number): [number, number] => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

/** Extra sheet px drawn around the sheet so the shadow and anti-aliased edges are not clipped. */
const QUAD_PADDING_PX = 2;
const MARKER_RADIUS_SCREEN_PX = 18;

/** A stencil to draw: where it sits, how big it is at scale 1, and how strongly it shows. */
export interface StencilDraw {
  placement: StencilPlacement;
  size: StencilSize;
  opacity: number;
}

export interface CompositeOptions {
  /** The stencil to draw; null when there is none or it is hidden. */
  stencil: StencilDraw | null;
  /** HEALED look: ink thinner and softer, trauma ignored. Otherwise FRESH. */
  healed: boolean;
  /** Debug: show the raw trauma buffer as a heatmap instead of the skin. */
  showTrauma: boolean;
}

/** Draws the skin sheet (and debug helpers) into the screen canvas. */
export class Compositor {
  private readonly gl: WebGL2RenderingContext;
  private readonly quad: twgl.BufferInfo;
  private readonly sheetProgram: twgl.ProgramInfo;
  private readonly markerProgram: twgl.ProgramInfo;
  private readonly skin: SkinTexture;
  private readonly hitDots: HitDots;
  private readonly ink: InkBuffer;
  private readonly trauma: TraumaBuffer;
  private readonly stencilTexture: StencilTexture;
  private readonly reducer: ScoreReducer;
  private readonly checkpoints: CheckpointPool;
  private readonly presets: PresetBundle;

  constructor(gl: WebGL2RenderingContext, presets: PresetBundle) {
    this.gl = gl;
    this.presets = presets;
    // Unit quad as a triangle strip; shared by every full-quad pass.
    this.quad = twgl.createBufferInfoFromArrays(gl, {
      a_corner: { numComponents: 2, data: [0, 0, 1, 0, 0, 1, 1, 1] },
    });
    this.sheetProgram = twgl.createProgramInfo(gl, [sheetVert, sheetFrag]);
    this.markerProgram = twgl.createProgramInfo(gl, [sheetVert, markerFrag]);
    this.skin = new SkinTexture(gl, this.quad);
    this.hitDots = new HitDots(gl);
    this.ink = new InkBuffer(gl, this.quad);
    this.trauma = new TraumaBuffer(gl, this.quad);
    this.stencilTexture = new StencilTexture(gl);
    this.reducer = new ScoreReducer(gl, this.quad);
    this.checkpoints = new CheckpointPool(gl);
  }

  /** Stamps a frame's dots: ink (with halos) into the ink buffer, needle dots into the trauma buffer. */
  stamp(batch: StampBatch): void {
    this.ink.stamp(batch.ink.data, batch.ink.count);
    this.trauma.stamp(batch.trauma.data, batch.trauma.count);
  }

  setStencil(bitmap: ImageBitmap): void {
    this.stencilTexture.set(bitmap);
  }

  clearStencil(): void {
    this.stencilTexture.clear();
  }

  /** Starts shrinking the ink and trauma buffers for the trauma level; false while one is in flight. */
  requestReduction(): boolean {
    return this.reducer.request(this.ink.totalTexture, this.trauma.texture, this.presets.trauma.overworkThreshold);
  }

  /** True while a reduction has been started and its result not collected. */
  get reductionBusy(): boolean {
    return this.reducer.busy;
  }

  /** The finished reduction, or null if it is not ready. Never waits for the GPU. */
  pollReduction(): Float32Array | null {
    return this.reducer.poll();
  }

  /** Copies the ink and trauma buffers into a checkpoint, on the GPU. */
  saveCheckpoint(): CheckpointSlot {
    const slot = this.checkpoints.acquire();
    this.checkpoints.save(slot, this.liveSources());
    return slot;
  }

  /** Puts a checkpoint back into the buffers; null is the blank sheet. */
  restoreCheckpoint(slot: CheckpointSlot | null): void {
    if (slot === null) {
      this.clearBuffers();
      return;
    }
    this.checkpoints.restore(slot, [this.ink.levelsTexture, this.ink.totalTexture, this.trauma.texture]);
    this.ink.markChanged();
    this.trauma.markChanged();
  }

  releaseCheckpoint(slot: CheckpointSlot): void {
    this.checkpoints.release(slot);
  }

  /** Full-size checkpoint copies allocated so far; stops growing once the pool is warm. */
  get checkpointSlots(): number {
    return this.checkpoints.allocated;
  }

  /** Reads the ink and trauma buffers back as half-float bits. Waits for the GPU: about 50 ms. */
  readBuffers(): RawBuffers {
    const [levels, total, trauma] = this.liveSources();
    return {
      levels: readHalves(this.gl, levels, 4),
      total: readHalves(this.gl, total, 1),
      trauma: readHalves(this.gl, trauma, 1),
    };
  }

  /** Replaces the ink and trauma buffers with saved ones. */
  writeBuffers(raw: RawBuffers): void {
    writeHalves(this.gl, this.ink.levelsTexture, raw.levels, 4);
    writeHalves(this.gl, this.ink.totalTexture, raw.total, 1);
    writeHalves(this.gl, this.trauma.texture, raw.trauma, 1);
    this.ink.markChanged();
    this.trauma.markChanged();
  }

  /** The sheet as it looks fresh, scaled to `width` px, as straight-alpha RGBA rows (top first). */
  renderPreview(width: number): { width: number; height: number; data: Uint8ClampedArray } {
    const gl = this.gl;
    const height = Math.round((width * SHEET_MM.height) / SHEET_MM.width);
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Could not allocate the preview");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.prepareFrame();
    const view = { zoom: width / SHEET_CSS_PX.width, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    this.draw(view, { width, height }, { stencil: null, healed: false, showTrauma: false });
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    return { width, height, data: toImageRows(pixels, width, height) };
  }

  /** Debug: hashes of the ink buffers and the trauma buffer, read back synchronously. */
  hashBuffers(): { ink: string; trauma: string } {
    const [levels, total, trauma] = this.liveSources();
    const ink = new BufferHasher();
    hashAttachment(this.gl, levels, ink);
    hashAttachment(this.gl, total, ink);
    const hurt = new BufferHasher();
    hashAttachment(this.gl, trauma, hurt);
    return { ink: ink.digest(), trauma: hurt.digest() };
  }

  private liveSources(): [CopySource, CopySource, CopySource] {
    return [
      { framebuffer: this.ink.framebuffer, attachment: 0 },
      { framebuffer: this.ink.framebuffer, attachment: 1 },
      { framebuffer: this.trauma.framebuffer, attachment: 0 },
    ];
  }

  /** Debug: forgets all ink and trauma. */
  clearBuffers(): void {
    this.ink.clear();
    this.trauma.clear();
  }

  /** Rebuilds the mip levels if anything was stamped; call once per frame before draw(). */
  prepareFrame(): void {
    this.ink.updateMipmaps();
    this.trauma.updateMipmaps();
  }

  setSkinTone(rgb: [number, number, number]): void {
    this.skin.generate(rgb);
  }

  /** Draws the sheet. The viewport and the clear are the caller's job. */
  draw(view: View, stage: Size, options: CompositeOptions): void {
    const gl = this.gl;
    const pad = QUAD_PADDING_PX;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.sheetProgram.program);
    twgl.setBuffersAndAttributes(gl, this.sheetProgram, this.quad);
    twgl.setUniforms(this.sheetProgram, {
      ...this.viewUniforms(view, stage),
      u_lo: [-pad, -pad],
      u_hi: [
        SHEET_CSS_PX.width + SHEET_SHADOW_OFFSET_PX + pad,
        SHEET_CSS_PX.height + SHEET_SHADOW_OFFSET_PX + pad,
      ],
      u_skin: this.skin.texture,
      u_ink: this.ink.levelsTexture,
      u_inkTotal: this.ink.totalTexture,
      u_trauma: this.trauma.texture,
      u_bufferSize: [BUFFER_TEXELS.width, BUFFER_TEXELS.height],
      u_healed: options.healed ? 1 : 0,
      u_freshRedness: this.presets.render.freshRedness,
      u_redScale: 1 / Math.max(this.presets.trauma.overworkThreshold, 1e-3),
      u_healedInkFactor: this.presets.render.healedInkFactor,
      u_healedBlurTexels: this.presets.render.healedBlurMm * TEXELS_PER_MM,
      u_overwork: this.presets.trauma.overworkThreshold,
      u_showTrauma: options.showTrauma ? 1 : 0,
      u_stencil: this.stencilTexture.texture,
      u_stencilOn: options.stencil ? 1 : 0,
      u_stencilOpacity: options.stencil?.opacity ?? 0,
      u_stencilColor: [...STENCIL_RGB],
      u_sheetMm: [SHEET_MM.width, SHEET_MM.height],
      u_stCenter: options.stencil ? [options.stencil.placement.centerXMm, options.stencil.placement.centerYMm] : [0, 0],
      u_stRot: stencilRotation(options.stencil?.placement.rotationDeg ?? 0),
      u_stScale: options.stencil?.placement.scale ?? 1,
      u_stSizeMm: options.stencil ? [options.stencil.size.widthMm, options.stencil.size.heightMm] : [1, 1],
      u_inkColor: [0, 1, 2, 3].flatMap((level) => inkTransmittance(level)),
      u_whiteInk: [...WHITE_INK_RGB],
      u_sheetSize: [SHEET_CSS_PX.width, SHEET_CSS_PX.height],
      u_radius: SHEET_CORNER_RADIUS_PX,
      u_border: SHEET_BORDER_PX,
      u_shadowOffset: [SHEET_SHADOW_OFFSET_PX, SHEET_SHADOW_OFFSET_PX],
      u_shadowAlpha: SHEET_SHADOW_ALPHA,
      u_borderColor: [...SHEET_BORDER_RGB],
    });
    twgl.drawBufferInfo(gl, this.quad, gl.TRIANGLE_STRIP);
  }

  /** Debug: draws the centre of every recorded hit. */
  drawHitDots(log: HitLog, view: View, stage: Size, byDeviation: boolean): void {
    this.hitDots.sync(log.positions, log.deviations, log.count);
    this.hitDots.draw(this.viewUniforms(view, stage), byDeviation);
  }

  /** Debug: marks a sheet position (mm) with a magenta ring and cross. */
  drawMarker(mm: Point, view: View, stage: Size): void {
    const gl = this.gl;
    const x = mm.x * CSS_PX_PER_MM;
    const y = mm.y * CSS_PX_PER_MM;
    const r = MARKER_RADIUS_SCREEN_PX / view.zoom;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.markerProgram.program);
    twgl.setBuffersAndAttributes(gl, this.markerProgram, this.quad);
    twgl.setUniforms(this.markerProgram, {
      ...this.viewUniforms(view, stage),
      u_lo: [x - r, y - r],
      u_hi: [x + r, y + r],
      u_marker: [x, y],
    });
    twgl.drawBufferInfo(gl, this.quad, gl.TRIANGLE_STRIP);
  }

  dispose(): void {
    const gl = this.gl;
    this.skin.dispose();
    this.hitDots.dispose();
    this.ink.dispose();
    this.trauma.dispose();
    this.stencilTexture.dispose();
    this.reducer.dispose();
    this.checkpoints.dispose();
    gl.deleteProgram(this.sheetProgram.program);
    gl.deleteProgram(this.markerProgram.program);
    for (const attrib of Object.values(this.quad.attribs ?? {}))
      gl.deleteBuffer(attrib.buffer);
  }

  private viewUniforms(view: View, stage: Size) {
    const a = (view.rotationDeg * Math.PI) / 180;
    return {
      u_viewport: [stage.width, stage.height],
      u_center: [SHEET_CSS_PX.width / 2, SHEET_CSS_PX.height / 2],
      u_pan: [view.offsetX, view.offsetY],
      u_rot: [Math.cos(a), Math.sin(a)],
      u_zoom: view.zoom,
    };
  }
}
