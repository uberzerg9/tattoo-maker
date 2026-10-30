import { useEffect } from "react";
import { track } from "../../lib/analytics";
import { useWorkspaceStore } from "../../store/workspaceStore";

/** `first_stroke`: the first stroke drawn on a work (not strokes that come with a work being opened). */
export function useWorkspaceEvents(): void {
  useEffect(() => {
    const done = new Set<string>();
    return useWorkspaceStore.subscribe(
      (s) => s.score.passes,
      (passes, previous) => {
        const s = useWorkspaceStore.getState();
        if (s.workLoading || previous !== 0 || passes !== 1 || done.has(s.workId)) return;
        done.add(s.workId);
        track.firstStroke({ cartridge: s.cartridge });
      },
    );
  }, []);
}
