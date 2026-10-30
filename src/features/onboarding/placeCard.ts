export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CardPlacement {
  left: number;
  top: number;
}

const GAP = 16;
const MARGIN = 12;
/** Bottom strip kept free for the toolbar and its hint. */
const TOOLBAR_ROOM = 140;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Where to put a tip card of `size` so it sits beside `target` without covering it: to the right, else to the
 * left, else (a target that spans the middle, such as the sheet) at the bottom centre above the toolbar.
 * With no target (not on screen, or its panel is collapsed) it also goes to the bottom centre.
 */
export function placeCard(target: Box | null, size: { width: number; height: number }, viewport: { width: number; height: number }): CardPlacement {
  const bottomCentre = {
    left: clamp((viewport.width - size.width) / 2, MARGIN, viewport.width - size.width - MARGIN),
    top: clamp(viewport.height - size.height - TOOLBAR_ROOM, MARGIN, viewport.height - size.height - MARGIN),
  };
  if (!target) return bottomCentre;
  const top = clamp(target.top, MARGIN, viewport.height - size.height - MARGIN);
  if (target.right + GAP + size.width <= viewport.width - MARGIN) return { left: target.right + GAP, top };
  if (target.left - GAP - size.width >= MARGIN) return { left: target.left - GAP - size.width, top };
  return bottomCentre;
}
