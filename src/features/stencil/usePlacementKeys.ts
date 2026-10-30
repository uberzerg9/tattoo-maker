import { useEffect } from "react";
import type { RefObject } from "react";
import type { TattooEngine } from "../../engine";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { applyStencil, cancelPlacement } from "./placementActions";

/** Where a key press belongs to something else: text being typed, or a dialog. */
const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"]';
/** Enter and Space also press the focused control, so they are left to it (the stencil's own handles do nothing with them). */
const PRESSABLE = 'button:not(.stencil-handle), a[href], [role="button"], summary';

/**
 * While a stencil is being placed: Enter or Space applies it, Escape cancels it and removes it.
 * Ignored in inputs and dialogs, and Enter / Space are ignored on buttons (the panels' and the toolbar's), which keep their own meaning.
 */
export function usePlacementKeys(engineRef: RefObject<TattooEngine | null>): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useWorkspaceStore.getState();
      const placing = s.stencilSize !== null && !s.stencilLocked && !s.stencilDialog.open;
      if (!placing || e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(TYPING)) return;

      if (e.key === "Enter" || e.key === " ") {
        if (target?.closest(PRESSABLE)) return;
        e.preventDefault(); // Space would scroll the page
        if (!e.repeat) applyStencil(engineRef.current);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelPlacement(engineRef.current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engineRef]);
}
