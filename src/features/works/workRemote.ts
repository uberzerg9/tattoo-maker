import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { deleteObject, getBlob, ref, uploadBytes } from "firebase/storage";
import type { EngineState } from "../../engine";
import { assertWritable } from "../../lib/features";
import { db, storage } from "../../lib/firebase";
import { OfflineError } from "./WorkSync";
import { sketchPaths, workPaths } from "./workTypes";
import type { LocalSketch, LocalWork, RemoteStore } from "./workTypes";

/** A request that has not answered by now is treated as no connection; the work stays on the device. */
const REQUEST_TIMEOUT_MS = 30_000;
// Without this a dropped connection keeps an upload retrying for ten minutes.
storage.maxUploadRetryTime = REQUEST_TIMEOUT_MS;
storage.maxOperationRetryTime = REQUEST_TIMEOUT_MS;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new OfflineError("The server did not answer in time")), REQUEST_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** users/{uid}/works/{id} as stored. */
export interface WorkDoc {
  title: string;
  sketchId: string | null;
  skinTone: string;
  inkPath: string;
  traumaPath: string;
  previewPath: string;
  sizeCm: number | null;
  presetsVersion: number;
  state: EngineState;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
}

/** users/{uid}/sketches/{id} as stored. */
export interface SketchDoc {
  originalPath: string;
  stencilPath: string;
  threshold: number;
  lineWeight: number;
  removeFills: boolean;
  fileName: string;
  createdAt: Timestamp;
}

export class FirebaseRemote implements RemoteStore {
  async uploadSketch(sketch: LocalSketch): Promise<void> {
    assertWritable();
    const paths = sketchPaths(sketch.uid, sketch.sketchId, sketch.originalType);
    await withTimeout(
      Promise.all([
        uploadBytes(ref(storage, paths.original), sketch.original, { contentType: sketch.originalType }),
        uploadBytes(ref(storage, paths.stencil), sketch.stencil, { contentType: "image/png" }),
      ]),
    );
    const data: SketchDoc = {
      originalPath: paths.original,
      stencilPath: paths.stencil,
      threshold: sketch.threshold,
      lineWeight: sketch.lineWeightPx,
      removeFills: sketch.removeFills,
      fileName: sketch.fileName,
      createdAt: Timestamp.fromMillis(sketch.createdAtMs),
    };
    await withTimeout(setDoc(doc(db, "users", sketch.uid, "sketches", sketch.sketchId), data));
  }

  async uploadWork(work: LocalWork): Promise<void> {
    assertWritable();
    const paths = workPaths(work.uid, work.workId);
    await withTimeout(
      Promise.all([
        uploadBytes(ref(storage, paths.ink), work.ink, { contentType: "application/octet-stream" }),
        uploadBytes(ref(storage, paths.trauma), work.trauma, { contentType: "application/octet-stream" }),
        uploadBytes(ref(storage, paths.preview), work.preview, { contentType: work.preview.type || "image/webp" }),
      ]),
    );
    const { meta } = work;
    await withTimeout(
      setDoc(doc(db, "users", work.uid, "works", work.workId), {
        title: meta.title,
        sketchId: meta.sketchId,
        skinTone: meta.skinTone,
        inkPath: paths.ink,
        traumaPath: paths.trauma,
        previewPath: paths.preview,
        sizeCm: meta.sizeCm,
        presetsVersion: meta.presetsVersion,
        state: meta.state,
        createdAt: Timestamp.fromMillis(meta.createdAtMs),
        updatedAt: serverTimestamp(),
      }),
    );
  }
}

export async function fetchWorkDoc(uid: string, workId: string): Promise<WorkDoc | null> {
  const snap = await withTimeout(getDoc(doc(db, "users", uid, "works", workId)));
  return snap.exists() ? (snap.data() as WorkDoc) : null;
}

export async function fetchSketchDoc(uid: string, sketchId: string): Promise<SketchDoc | null> {
  const snap = await withTimeout(getDoc(doc(db, "users", uid, "sketches", sketchId)));
  return snap.exists() ? (snap.data() as SketchDoc) : null;
}

export const downloadFile = (path: string): Promise<Blob> => withTimeout(getBlob(ref(storage, path)));

/** The person's works, newest first, kept up to date. */
export function listenWorks(uid: string, cb: (works: { id: string; data: WorkDoc }[]) => void, onError: () => void): () => void {
  const q = query(collection(db, "users", uid, "works"), orderBy("updatedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, data: d.data() as WorkDoc }))),
    onError,
  );
}

/** Storage says "not found" for a file that is already gone; for a delete that is the result we want. */
const ignoreMissing = (error: unknown): void => {
  if ((error as { code?: unknown } | null)?.code !== "storage/object-not-found") throw error;
};

/** The title is shown in the profile; updatedAt moves with it because the rules require the server time on every write. */
export async function renameWorkRemote(uid: string, workId: string, title: string): Promise<void> {
  assertWritable();
  await withTimeout(updateDoc(doc(db, "users", uid, "works", workId), { title, updatedAt: serverTimestamp() }));
}

/** Removes a work's three files and then its document. */
export async function deleteWorkRemote(uid: string, workId: string): Promise<void> {
  assertWritable();
  const paths = workPaths(uid, workId);
  await withTimeout(
    Promise.all([paths.ink, paths.trauma, paths.preview].map((path) => deleteObject(ref(storage, path)).catch(ignoreMissing))),
  );
  await withTimeout(deleteDoc(doc(db, "users", uid, "works", workId)));
}

/** Whether some other work still uses a sketch. */
export async function sketchIsUsed(uid: string, sketchId: string, exceptWorkId: string): Promise<boolean> {
  const snap = await withTimeout(getDocs(query(collection(db, "users", uid, "works"), where("sketchId", "==", sketchId), limit(2))));
  return snap.docs.some((d) => d.id !== exceptWorkId);
}

/** The sketch behind a deleted work: its files and its document. */
export async function deleteSketchRemote(uid: string, sketchId: string): Promise<void> {
  assertWritable();
  const snap = await withTimeout(getDoc(doc(db, "users", uid, "sketches", sketchId)));
  const data = snap.data() as SketchDoc | undefined;
  const paths = data ? [data.originalPath, data.stencilPath] : [];
  await withTimeout(Promise.all(paths.map((path) => deleteObject(ref(storage, path)).catch(ignoreMissing))));
  await withTimeout(deleteDoc(doc(db, "users", uid, "sketches", sketchId)));
}
