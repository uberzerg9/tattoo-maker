import { DEFAULT_PANEL_POSITIONS, PANEL_IDS } from "./config";
import type { PanelId, PanelPosition } from "./config";

/** Where the floating panels are and which are open: saved as users/{uid}.settings.panelLayout. */
export interface PanelLayout {
  positions: Record<PanelId, PanelPosition>;
  open: Record<PanelId, boolean>;
}

/** Panels never sit farther than this from their edge; keeps a bad value from hiding one. */
const MAX_OFFSET_PX = 4000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isOffset = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_OFFSET_PX;

/**
 * What is stored may be old, hand-edited or from another version: keep what is valid and fall back to
 * the default for the rest. Returns null when nothing usable is there.
 */
export function sanitizePanelLayout(raw: unknown): PanelLayout | null {
  if (!isRecord(raw)) return null;
  const rawPositions = isRecord(raw.positions) ? raw.positions : {};
  const rawOpen = isRecord(raw.open) ? raw.open : {};
  let any = false;

  const positions = { ...DEFAULT_PANEL_POSITIONS };
  const open = Object.fromEntries(PANEL_IDS.map((id) => [id, true])) as Record<PanelId, boolean>;
  for (const id of PANEL_IDS) {
    const p = rawPositions[id];
    if (isRecord(p) && (p.side === "left" || p.side === "right") && isOffset(p.x) && isOffset(p.y)) {
      positions[id] = { side: p.side, x: p.x, y: p.y };
      any = true;
    }
    if (typeof rawOpen[id] === "boolean") {
      open[id] = rawOpen[id];
      any = true;
    }
  }
  return any ? { positions, open } : null;
}

/** Rounds positions to whole pixels, so dragging does not write a new value for every fraction. */
export function layoutOf(positions: Record<PanelId, PanelPosition>, open: Record<PanelId, boolean>): PanelLayout {
  const rounded = Object.fromEntries(
    PANEL_IDS.map((id) => [id, { side: positions[id].side, x: Math.round(positions[id].x), y: Math.round(positions[id].y) }]),
  ) as Record<PanelId, PanelPosition>;
  return { positions: rounded, open: { ...open } };
}
