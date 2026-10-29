import { CSS_PX_PER_MM, SHEET_MM } from "./constants";
import type { EngineView } from "./types";

export type View = EngineView;

/** Size of the stage (the canvas) in CSS px. Screen coordinates are relative to its top-left. */
export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const DEFAULT_VIEW: View = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotationDeg: 0,
};

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/**
 * Screen position of a sheet point. The sheet is scaled by zoom and rotated (clockwise on
 * screen, like CSS rotate) around its centre, which sits at the stage centre plus the offset.
 */
export function sheetMmToScreen(
  xMm: number,
  yMm: number,
  view: View,
  stage: Size,
): Point {
  const a = toRadians(view.rotationDeg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = (xMm - SHEET_MM.width / 2) * CSS_PX_PER_MM * view.zoom;
  const dy = (yMm - SHEET_MM.height / 2) * CSS_PX_PER_MM * view.zoom;
  return {
    x: stage.width / 2 + view.offsetX + cos * dx - sin * dy,
    y: stage.height / 2 + view.offsetY + sin * dx + cos * dy,
  };
}

/** Sheet position (mm) under a screen point. Inverse of sheetMmToScreen. */
export function screenToSheetMm(
  x: number,
  y: number,
  view: View,
  stage: Size,
): Point {
  const px = x - stage.width / 2 - view.offsetX;
  const py = y - stage.height / 2 - view.offsetY;
  const a = toRadians(view.rotationDeg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = (cos * px + sin * py) / view.zoom;
  const dy = (-sin * px + cos * py) / view.zoom;
  return {
    x: dx / CSS_PX_PER_MM + SHEET_MM.width / 2,
    y: dy / CSS_PX_PER_MM + SHEET_MM.height / 2,
  };
}

export function isInsideSheet(p: Point): boolean {
  return (
    p.x >= 0 && p.x <= SHEET_MM.width && p.y >= 0 && p.y <= SHEET_MM.height
  );
}

/** Screen positions of the four sheet corners, clockwise from the top-left. */
export function sheetCornersScreen(view: View, stage: Size): Point[] {
  const { width: w, height: h } = SHEET_MM;
  return [
    sheetMmToScreen(0, 0, view, stage),
    sheetMmToScreen(w, 0, view, stage),
    sheetMmToScreen(w, h, view, stage),
    sheetMmToScreen(0, h, view, stage),
  ];
}
