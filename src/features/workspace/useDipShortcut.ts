import { useEffect } from "react";
import { useWorkspaceStore } from "../../store/workspaceStore";

/** True when typing would be hijacked: focus is in a form field or an editable element. */
export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

/** Ctrl/⌘ + D dips the needle, unless focus is in an input. */
export function useDipShortcut() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "d") return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (isEditable(e.target) || isEditable(document.activeElement)) return;
      e.preventDefault(); // the browser would bookmark the page
      if (!e.repeat) useWorkspaceStore.getState().dip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
