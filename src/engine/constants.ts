/** Sheet size in millimetres. All physics runs in this space. */
export const SHEET_MM = { width: 200, height: 150 } as const;

/** Buffer resolution. Texel (u, v) maps to mm (u * 200, v * 150); row 0 is the top of the sheet. */
export const BUFFER_TEXELS = { width: 2048, height: 1536 } as const;
export const TEXELS_PER_MM = BUFFER_TEXELS.width / SHEET_MM.width;

/** CSS px per millimetre at 100% zoom. */
export const CSS_PX_PER_MM = 3.2;

/** Sheet size on screen at 100% zoom, in CSS px. */
export const SHEET_CSS_PX = {
  width: SHEET_MM.width * CSS_PX_PER_MM,
  height: SHEET_MM.height * CSS_PX_PER_MM,
} as const;

/** Sheet frame from the mockup, in CSS px at 100% zoom (it scales with the view). */
export const SHEET_CORNER_RADIUS_PX = 26;
export const SHEET_BORDER_PX = 3;
export const SHEET_SHADOW_OFFSET_PX = 10;
export const SHEET_SHADOW_ALPHA = 0.55;
/** Matches --color-ink in tokens.css. */
export const SHEET_BORDER_RGB = [14 / 255, 14 / 255, 14 / 255] as const;

/** Stencil line colour, the purple of transfer paper. Matches --color-stencil in tokens.css. */
export const STENCIL_RGB = [0x6a / 255, 0x3f / 255, 0xb5 / 255] as const;
