import type { LocalSketch, LocalStore, LocalWork, RemoteStore, SaveStatus } from "./workTypes";

/** Error codes that mean "no network or no server right now", not "the request was refused". */
const OFFLINE_CODES = new Set([
  "unavailable",
  "deadline-exceeded",
  "storage/retry-limit-exceeded",
  "storage/canceled",
  "storage/unknown",
  "offline",
]);

export class OfflineError extends Error {
  readonly code = "offline";
}

export function isOfflineError(error: unknown, online: boolean): boolean {
  if (!online) return true;
  if (error instanceof OfflineError) return true;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && OFFLINE_CODES.has(code)) return true;
  return error instanceof TypeError && /fetch|network/i.test(error.message);
}

export interface WorkSyncOptions {
  local: LocalStore;
  remote: RemoteStore;
  isOnline?: () => boolean;
  now?: () => number;
}

/**
 * Saves to the device first, so a dropped connection loses nothing, then uploads. Uploads run
 * one at a time. A work that could not be uploaded stays marked as not synced and is tried
 * again by flush().
 */
export class WorkSync {
  private readonly local: LocalStore;
  private readonly remote: RemoteStore;
  private readonly isOnline: () => boolean;
  private readonly now: () => number;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(status: SaveStatus) => void>();
  private changeListeners = new Set<() => void>();
  status: SaveStatus = "idle";

  constructor(options: WorkSyncOptions) {
    this.local = options.local;
    this.remote = options.remote;
    this.isOnline = options.isOnline ?? (() => true);
    this.now = options.now ?? Date.now;
  }

  onStatus(cb: (status: SaveStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Called after anything changed on the device or in the cloud, so lists can refresh. */
  onChange(cb: () => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  /** Tells listeners that works on the device changed from outside (renamed, deleted). */
  notifyChanged(): void {
    this.changed();
  }

  /** Saves on the device, then uploads. Resolves with the status it ended in; never rejects. */
  async save(work: Omit<LocalWork, "savedAtMs" | "syncedAtMs">): Promise<SaveStatus> {
    this.setStatus("saving");
    const record: LocalWork = { ...work, savedAtMs: this.now(), syncedAtMs: null };
    try {
      await this.local.putWork(record);
    } catch {
      this.setStatus("failed"); // the device could not store it either
      return "failed";
    }
    this.changed();
    return this.enqueue(() => this.upload(record));
  }

  /** Stores a sketch on the device; it is uploaded with the next work that uses it, or by flush(). */
  async saveSketch(sketch: LocalSketch): Promise<void> {
    await this.local.putSketch(sketch);
    this.changed();
  }

  /** Uploads whatever is waiting: the works the device has that the cloud does not have yet. */
  async flush(works: LocalWork[]): Promise<SaveStatus> {
    const pending = works.filter((w) => w.syncedAtMs !== w.savedAtMs);
    if (pending.length === 0) return this.status;
    this.setStatus("saving");
    return this.enqueue(async () => {
      let result: SaveStatus = "saved";
      for (const work of pending) {
        // A newer save may have replaced this one while it waited.
        const current = (await this.local.getWork(work.uid, work.workId)) ?? work;
        result = await this.upload(current);
        if (result !== "saved") break;
      }
      return result;
    });
  }

  private enqueue(job: () => Promise<SaveStatus>): Promise<SaveStatus> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async upload(work: LocalWork): Promise<SaveStatus> {
    if (!this.isOnline()) {
      this.setStatus("offline");
      return "offline";
    }
    try {
      if (work.meta.sketchId) {
        const sketch = await this.local.getSketch(work.uid, work.meta.sketchId);
        if (sketch && !sketch.synced) {
          await this.remote.uploadSketch(sketch);
          await this.local.markSketchSynced(work.uid, sketch.sketchId);
        }
      }
      await this.remote.uploadWork(work);
      await this.local.markWorkSynced(work.uid, work.workId, work.savedAtMs);
      this.changed();
      // Something newer may have been saved on the device while this was uploading.
      const latest = await this.local.getWork(work.uid, work.workId);
      const status: SaveStatus = latest && latest.syncedAtMs !== latest.savedAtMs ? "saving" : "saved";
      this.setStatus(status);
      return status;
    } catch (error) {
      const status: SaveStatus = isOfflineError(error, this.isOnline()) ? "offline" : "failed";
      this.setStatus(status);
      return status;
    }
  }

  private setStatus(status: SaveStatus): void {
    this.status = status;
    for (const cb of this.listeners) cb(status);
  }

  private changed(): void {
    for (const cb of this.changeListeners) cb();
  }
}
