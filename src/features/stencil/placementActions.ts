import type { TattooEngine } from "../../engine";
import { auth } from "../../lib/firebase";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { localStore } from "../works/workServices";

/** Locks the stencil onto the skin: the handles go and drawing starts. */
export function applyStencil(engine: TattooEngine | null): void {
  if (!engine) return;
  engine.applyStencil();
  useWorkspaceStore.getState().setStencilLocked(true);
}

/** Drops the stencil and goes back to the transfer dialog, where another sketch (or the same one) can be chosen. */
export function cancelPlacement(engine: TattooEngine | null): void {
  const store = useWorkspaceStore.getState();
  const uid = auth.currentUser?.uid;
  const sketch = store.sketch;
  engine?.removeStencil();
  store.stencilRemoved();
  // The sketch made for this transfer is no use to anyone now; it never left this device.
  if (uid && sketch) void localStore.deleteSketch(uid, sketch.id).catch(() => undefined);
  store.openStencilDialog();
}
