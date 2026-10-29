import { SHEET_MM, TEXELS_PER_MM } from "./constants";
import type { StencilPlacement } from "./types";
import type { Point } from "./view";

/** SPEC: a stencil is at most 15 cm tall, the height of the sheet. */
export const MAX_STENCIL_HEIGHT_MM = SHEET_MM.height;
export const MIN_STENCIL_SCALE = 0.1;

export interface StencilSize {
  widthMm: number;
  heightMm: number;
}

/** Size of a stencil raster at scale 1: the raster is at the engine's texel size. */
export function stencilSizeMm(widthTexels: number, heightTexels: number): StencilSize {
  return { widthMm: widthTexels / TEXELS_PER_MM, heightMm: heightTexels / TEXELS_PER_MM };
}

/** Where a new stencil starts: centred on the sheet, upright, at the size it was made. */
export const defaultPlacement = (): StencilPlacement => ({
  centerXMm: SHEET_MM.width / 2,
  centerYMm: SHEET_MM.height / 2,
  rotationDeg: 0,
  scale: 1,
});

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/**
 * Position inside the stencil, 0..1 on both axes (outside that range when off the stencil),
 * of a sheet point. The stencil is scaled and rotated (clockwise on screen) around its centre.
 */
export function sheetToStencil(xMm: number, yMm: number, p: StencilPlacement, size: StencilSize): { u: number; v: number } {
  const a = toRadians(p.rotationDeg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = (xMm - p.centerXMm) / p.scale;
  const dy = (yMm - p.centerYMm) / p.scale;
  return {
    u: (cos * dx + sin * dy) / size.widthMm + 0.5,
    v: (-sin * dx + cos * dy) / size.heightMm + 0.5,
  };
}

/** Sheet point (mm) of a position inside the stencil. Inverse of sheetToStencil. */
export function stencilToSheet(u: number, v: number, p: StencilPlacement, size: StencilSize): Point {
  const a = toRadians(p.rotationDeg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = (u - 0.5) * size.widthMm * p.scale;
  const dy = (v - 0.5) * size.heightMm * p.scale;
  return { x: p.centerXMm + cos * dx - sin * dy, y: p.centerYMm + sin * dx + cos * dy };
}

/** Sheet positions (mm) of the stencil's corners, clockwise from the top-left. */
export function stencilCorners(p: StencilPlacement, size: StencilSize): Point[] {
  return [
    stencilToSheet(0, 0, p, size),
    stencilToSheet(1, 0, p, size),
    stencilToSheet(1, 1, p, size),
    stencilToSheet(0, 1, p, size),
  ];
}

/** Keeps a placement usable: not bigger than the sheet allows, not tiny, centre on the sheet. */
export function clampPlacement(p: StencilPlacement, size: StencilSize): StencilPlacement {
  const maxScale = Math.min(MAX_STENCIL_HEIGHT_MM / size.heightMm, SHEET_MM.width / size.widthMm);
  const scale = Math.min(Math.max(p.scale, MIN_STENCIL_SCALE), Math.max(maxScale, MIN_STENCIL_SCALE));
  return {
    centerXMm: Math.min(Math.max(p.centerXMm, 0), SHEET_MM.width),
    centerYMm: Math.min(Math.max(p.centerYMm, 0), SHEET_MM.height),
    rotationDeg: ((((p.rotationDeg + 180) % 360) + 360) % 360) - 180,
    scale,
  };
}
