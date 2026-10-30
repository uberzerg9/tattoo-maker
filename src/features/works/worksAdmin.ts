import { deleteSketchRemote, deleteWorkRemote, renameWorkRemote, sketchIsUsed } from "./workRemote";
import { localStore, workSync } from "./workServices";

/** Renames a work in the cloud and on this device, so an older local copy cannot bring the old name back. */
export async function renameWork(uid: string, workId: string, title: string): Promise<void> {
  const clean = title.trim();
  await renameWorkRemote(uid, workId, clean);
  await localStore.renameWork(uid, workId, clean).catch(() => undefined);
  workSync.notifyChanged();
}

/**
 * Deletes a work: its Storage files and document, the device's copy, and its sketch when no other
 * work uses it. The work's own files go first, so a failure half-way leaves a work that can be retried.
 */
export async function deleteWork(uid: string, workId: string, sketchId: string | null): Promise<void> {
  await deleteWorkRemote(uid, workId);
  await localStore.deleteWork(uid, workId).catch(() => undefined);
  if (sketchId && !(await sketchIsUsed(uid, sketchId, workId))) {
    await deleteSketchRemote(uid, sketchId);
    await localStore.deleteSketch(uid, sketchId).catch(() => undefined);
  }
  workSync.notifyChanged();
}
