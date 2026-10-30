import type { TattooEngine } from "../../engine";
import { stencilSizeMm } from "../../engine/stencil";
import i18n from "../../i18n";
import { writesDisabled } from "../../lib/features";
import { auth } from "../../lib/firebase";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { rebuildStencil } from "../stencil/rebuildStencil";
import type { SkinToneId } from "../workspace/config";
import { fetchSketchDoc, fetchWorkDoc, downloadFile } from "./workRemote";
import type { WorkDoc } from "./workRemote";
import { localStore, workSync } from "./workServices";
import { localKey } from "./workTypes";
import type { WorkMeta } from "./workTypes";

const store = useWorkspaceStore;

/** A cloud copy only wins over a copy on this device when it is clearly newer (device clocks differ). */
const STALE_MARGIN_MS = 60_000;
/** Height of a stencil when a work does not say (it always does). */
const DEFAULT_STENCIL_CM = 12;

/** Keeps `?work=<id>` in the address so a reload comes back to the same work. */
function showWorkInUrl(id: string | null): void {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("work", id);
  else url.searchParams.delete("work");
  window.history.replaceState(null, "", url);
}

function titleOfCurrentWork(): string {
  const { workTitle, stencilFileName } = store.getState();
  if (workTitle) return workTitle;
  if (stencilFileName) return stencilFileName.replace(/\.[^.]+$/, "");
  return i18n.t("workspace.work.untitled");
}

/**
 * Saves the sheet: on this device first, then to the cloud. The GPU read happens right away,
 * so this is safe to call just before the engine is destroyed; encoding and uploading carry on.
 */
export async function saveWork(engine: TattooEngine): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid || store.getState().workLoading || writesDisabled()) return false;
  const s = store.getState();
  s.setSaveStatus("saving");

  let snapshot;
  try {
    const pending = engine.snapshot();
    store.getState().setDirty(false); // anything drawn from here on is a change after this save
    snapshot = await pending;
  } catch {
    store.getState().setDirty(true);
    store.getState().setSaveStatus("failed");
    return false;
  }
  const meta: WorkMeta = {
    title: titleOfCurrentWork(),
    sketchId: s.sketch?.id ?? null,
    skinTone: s.skinTone,
    sizeCm: s.sketch?.heightCm ?? null,
    presetsVersion: snapshot.state.presetsVersion,
    state: snapshot.state,
    createdAtMs: s.workCreatedAtMs,
  };
  const status = await workSync.save({
    key: localKey(uid, s.workId),
    uid,
    workId: s.workId,
    ink: snapshot.ink,
    trauma: snapshot.trauma,
    preview: snapshot.preview,
    meta,
  });
  if (status === "failed") store.getState().setDirty(true); // not safe anywhere: keep offering to save
  else if (store.getState().workId === s.workId) store.getState().setWorkSaved(true);
  return status !== "failed";
}

interface LoadedWork {
  meta: WorkMeta;
  ink: Blob;
  trauma: Blob;
}

const metaFromDoc = (d: WorkDoc): WorkMeta => ({
  title: d.title,
  sketchId: d.sketchId,
  skinTone: d.skinTone,
  sizeCm: d.sizeCm,
  presetsVersion: d.presetsVersion,
  state: d.state,
  createdAtMs: d.createdAt.toMillis(),
});

/** The newest copy of a work: from this device, or from the cloud when it is clearly newer. */
async function loadWork(uid: string, workId: string): Promise<LoadedWork> {
  const local = await localStore.getWork(uid, workId).catch(() => undefined);
  const localIsPending = local !== undefined && local.syncedAtMs !== local.savedAtMs;

  let remote: WorkDoc | null = null;
  if (!localIsPending) remote = await fetchWorkDoc(uid, workId).catch(() => null);

  const remoteIsNewer = remote?.updatedAt != null && (local === undefined || remote.updatedAt.toMillis() > local.savedAtMs + STALE_MARGIN_MS);
  if (local && !remoteIsNewer) return { meta: local.meta, ink: local.ink, trauma: local.trauma };
  if (remote) {
    const [ink, trauma] = await Promise.all([downloadFile(remote.inkPath), downloadFile(remote.traumaPath)]);
    return { meta: metaFromDoc(remote), ink, trauma };
  }
  throw new Error("This work was not found");
}

interface LoadedSketch {
  fileName: string;
  original: Blob;
  threshold: number;
  lineWeightPx: number;
  removeFills: boolean;
}

async function loadSketch(uid: string, sketchId: string): Promise<LoadedSketch> {
  const local = await localStore.getSketch(uid, sketchId).catch(() => undefined);
  if (local) return local;
  const doc = await fetchSketchDoc(uid, sketchId);
  if (!doc) throw new Error("The sketch of this work was not found");
  return {
    fileName: doc.fileName,
    original: await downloadFile(doc.originalPath),
    threshold: doc.threshold,
    lineWeightPx: doc.lineWeight,
    removeFills: doc.removeFills,
  };
}

/** Puts a saved work on the sheet. Throws, leaving the sheet as it was, if it cannot be loaded. */
export async function openWork(engine: TattooEngine, workId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  store.getState().setWorkLoading(true);
  try {
    const { meta, ink, trauma } = await loadWork(uid, workId);

    // Everything that can fail on the network is fetched before the sheet is touched.
    let stencil: Awaited<ReturnType<typeof rebuildStencil>> | null = null;
    let sketch: LoadedSketch | null = null;
    if (meta.sketchId) {
      sketch = await loadSketch(uid, meta.sketchId);
      stencil = await rebuildStencil(sketch.original, sketch.fileName, {
        threshold: sketch.threshold,
        lineWeightPx: sketch.lineWeightPx,
        removeFills: sketch.removeFills,
        heightMm: (meta.sizeCm ?? DEFAULT_STENCIL_CM) * 10,
      });
    }

    if (stencil && sketch && meta.sketchId) {
      engine.setStencil(stencil.mask, stencil.distanceMm);
      store.getState().setStencilInfo({
        fileName: sketch.fileName,
        thumbUrl: URL.createObjectURL(sketch.original),
        size: stencilSizeMm(stencil.width, stencil.height),
        placement: meta.state.placement ?? store.getState().stencilPlacement,
      });
      store.getState().setSketch({ id: meta.sketchId, heightCm: meta.sizeCm ?? DEFAULT_STENCIL_CM });
    } else {
      engine.newWork(); // a work without a stencil must not keep the previous work's
      store.getState().setStencilInfo(null);
      store.getState().setSketch(null);
    }
    store.getState().setSkinTone(meta.skinTone as SkinToneId);
    await engine.restore({ ink, trauma, state: meta.state });

    store.getState().beginWork({ id: workId, title: meta.title, createdAtMs: meta.createdAtMs });
    store.getState().setWorkSaved(true);
    store.getState().setSaveStatus("saved");
    showWorkInUrl(workId);
  } finally {
    store.getState().setWorkLoading(false);
    store.getState().setDirty(false); // the skin tone and placement set above are not edits
  }
}

/** A clean sheet and a new work id. */
export function startNewWork(engine: TattooEngine): void {
  engine.newWork();
  store.getState().startFreshWork(); // new id, no stencil, and the profile's workspace defaults
  showWorkInUrl(null);
}
