import { useEffect } from "react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { isEditable } from "./useDipShortcut";

/** Ctrl/⌘ + Z takes the last stroke back, unless focus is in an input. */
export function useUndoShortcut() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z") return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (isEditable(e.target) || isEditable(document.activeElement)) return;
      e.preventDefault();
      useWorkspaceStore.getState().undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
