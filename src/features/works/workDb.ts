import type { LocalSketch, LocalStore, LocalWork } from "./workTypes";
import { localKey } from "./workTypes";

const DB_NAME = "tattoo-trainer";
const DB_VERSION = 1;
const WORKS = "works";
const SKETCHES = "sketches";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of [WORKS, SKETCHES]) {
        const store = db.createObjectStore(name, { keyPath: "key" });
        store.createIndex("uid", "uid");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the local database"));
  });
}

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Local database error"));
    tx.onabort = () => reject(tx.error ?? new Error("Local database transaction aborted"));
  });

const result = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local database error"));
  });

/** Works and sketches kept on this device: the copy that survives a dropped connection. */
export class IndexedDbStore implements LocalStore {
  private db: Promise<IDBDatabase> | null = null;

  private connect(): Promise<IDBDatabase> {
    this.db ??= open();
    return this.db;
  }

  async putWork(work: LocalWork): Promise<void> {
    const tx = (await this.connect()).transaction(WORKS, "readwrite");
    tx.objectStore(WORKS).put(work);
    await done(tx);
  }

  async getWork(uid: string, workId: string): Promise<LocalWork | undefined> {
    const tx = (await this.connect()).transaction(WORKS, "readonly");
    return result(tx.objectStore(WORKS).get(localKey(uid, workId)) as IDBRequest<LocalWork | undefined>);
  }

  async listWorks(uid: string): Promise<LocalWork[]> {
    const tx = (await this.connect()).transaction(WORKS, "readonly");
    return result(tx.objectStore(WORKS).index("uid").getAll(uid) as IDBRequest<LocalWork[]>);
  }

  async markWorkSynced(uid: string, workId: string, savedAtMs: number): Promise<void> {
    const tx = (await this.connect()).transaction(WORKS, "readwrite");
    const store = tx.objectStore(WORKS);
    const work = await result(store.get(localKey(uid, workId)) as IDBRequest<LocalWork | undefined>);
    if (work && work.savedAtMs === savedAtMs) store.put({ ...work, syncedAtMs: savedAtMs });
    await done(tx);
  }

  async renameWork(uid: string, workId: string, title: string): Promise<void> {
    const tx = (await this.connect()).transaction(WORKS, "readwrite");
    const store = tx.objectStore(WORKS);
    const work = await result(store.get(localKey(uid, workId)) as IDBRequest<LocalWork | undefined>);
    if (work) store.put({ ...work, meta: { ...work.meta, title } });
    await done(tx);
  }

  async deleteWork(uid: string, workId: string): Promise<void> {
    const tx = (await this.connect()).transaction(WORKS, "readwrite");
    tx.objectStore(WORKS).delete(localKey(uid, workId));
    await done(tx);
  }

  async deleteSketch(uid: string, sketchId: string): Promise<void> {
    const tx = (await this.connect()).transaction(SKETCHES, "readwrite");
    tx.objectStore(SKETCHES).delete(localKey(uid, sketchId));
    await done(tx);
  }

  async deleteUser(uid: string): Promise<void> {
    const tx = (await this.connect()).transaction([WORKS, SKETCHES], "readwrite");
    for (const name of [WORKS, SKETCHES]) {
      const keys = tx.objectStore(name).index("uid").getAllKeys(uid);
      keys.onsuccess = () => keys.result.forEach((key) => tx.objectStore(name).delete(key));
    }
    await done(tx);
  }

  async putSketch(sketch: LocalSketch): Promise<void> {
    const tx = (await this.connect()).transaction(SKETCHES, "readwrite");
    tx.objectStore(SKETCHES).put(sketch);
    await done(tx);
  }

  async getSketch(uid: string, sketchId: string): Promise<LocalSketch | undefined> {
    const tx = (await this.connect()).transaction(SKETCHES, "readonly");
    return result(tx.objectStore(SKETCHES).get(localKey(uid, sketchId)) as IDBRequest<LocalSketch | undefined>);
  }

  async markSketchSynced(uid: string, sketchId: string): Promise<void> {
    const tx = (await this.connect()).transaction(SKETCHES, "readwrite");
    const store = tx.objectStore(SKETCHES);
    const sketch = await result(store.get(localKey(uid, sketchId)) as IDBRequest<LocalSketch | undefined>);
    if (sketch) store.put({ ...sketch, synced: true });
    await done(tx);
  }
}
