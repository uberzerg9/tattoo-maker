import type { EngineState } from "../../engine";

export type SaveStatus = "idle" | "saving" | "saved" | "offline" | "failed";

/** What a work says about itself besides the two buffers and the preview. */
export interface WorkMeta {
  title: string;
  sketchId: string | null;
  skinTone: string;
  /** Height of the stencil in cm, null without one. */
  sizeCm: number | null;
  presetsVersion: number;
  state: EngineState;
  createdAtMs: number;
}

/** A work as it sits in IndexedDB. */
export interface LocalWork {
  key: string;
  uid: string;
  workId: string;
  ink: Blob;
  trauma: Blob;
  preview: Blob;
  meta: WorkMeta;
  /** When the device saved it (device clock). */
  savedAtMs: number;
  /** `savedAtMs` of the version that reached Storage and Firestore; null while none has. */
  syncedAtMs: number | null;
}

/** A sketch and the stencil made from it, as it sits in IndexedDB. */
export interface LocalSketch {
  key: string;
  uid: string;
  sketchId: string;
  fileName: string;
  original: Blob;
  originalType: string;
  /** PNG of the stencil lines, kept as a thumbnail; the stencil itself is rebuilt from `original`. */
  stencil: Blob;
  threshold: number;
  lineWeightPx: number;
  removeFills: boolean;
  createdAtMs: number;
  synced: boolean;
}

export interface LocalStore {
  putWork(work: LocalWork): Promise<void>;
  getWork(uid: string, workId: string): Promise<LocalWork | undefined>;
  listWorks(uid: string): Promise<LocalWork[]>;
  /** Marks the version saved at `savedAtMs` as uploaded; does nothing if a newer one was saved since. */
  markWorkSynced(uid: string, workId: string, savedAtMs: number): Promise<void>;
  putSketch(sketch: LocalSketch): Promise<void>;
  getSketch(uid: string, sketchId: string): Promise<LocalSketch | undefined>;
  markSketchSynced(uid: string, sketchId: string): Promise<void>;
  /** Changes the title of a work kept on the device, leaving its save and upload times alone. */
  renameWork(uid: string, workId: string, title: string): Promise<void>;
  deleteWork(uid: string, workId: string): Promise<void>;
  deleteSketch(uid: string, sketchId: string): Promise<void>;
  /** Everything kept on the device for a person (after their account is deleted). */
  deleteUser(uid: string): Promise<void>;
}

export interface RemoteStore {
  uploadSketch(sketch: LocalSketch): Promise<void>;
  uploadWork(work: LocalWork): Promise<void>;
}

export const localKey = (uid: string, id: string) => `${uid}/${id}`;

export const workPaths = (uid: string, workId: string) => ({
  ink: `users/${uid}/works/${workId}/ink.bin`,
  trauma: `users/${uid}/works/${workId}/trauma.bin`,
  preview: `users/${uid}/works/${workId}/preview.webp`,
});

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const sketchExtension = (type: string) => EXTENSIONS[type] ?? "png";

export const sketchPaths = (uid: string, sketchId: string, originalType: string) => ({
  original: `users/${uid}/sketches/${sketchId}/original.${sketchExtension(originalType)}`,
  stencil: `users/${uid}/sketches/${sketchId}/stencil.png`,
});
