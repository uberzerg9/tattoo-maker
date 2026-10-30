import { describe, expect, it } from "vitest";
import { OfflineError, WorkSync, isOfflineError } from "./WorkSync";
import type { LocalSketch, LocalStore, LocalWork, RemoteStore } from "./workTypes";
import { localKey, sketchPaths, workPaths } from "./workTypes";

const blob = () => new Blob(["x"]);
const state = { version: 1 as const, presetsVersion: 1, strokes: 2, deviation: { sum: 0, count: 0 }, supply: { caps: {}, needles: {} }, placement: null };
const work = (id = "w1", sketchId: string | null = null): Omit<LocalWork, "savedAtMs" | "syncedAtMs"> => ({
  key: localKey("u1", id),
  uid: "u1",
  workId: id,
  ink: blob(),
  trauma: blob(),
  preview: blob(),
  meta: { title: "t", sketchId, skinTone: "t2", sizeCm: null, presetsVersion: 1, state, createdAtMs: 1 },
});
const sketch = (id: string): LocalSketch => ({
  key: localKey("u1", id), uid: "u1", sketchId: id, fileName: "a.png", original: blob(), originalType: "image/png", stencil: blob(),
  threshold: 140, lineWeightPx: 2.5, removeFills: true, createdAtMs: 1, synced: false,
});

class FakeLocal implements LocalStore {
  works = new Map<string, LocalWork>();
  sketches = new Map<string, LocalSketch>();
  failPut = false;
  async putWork(w: LocalWork) { if (this.failPut) throw new Error("quota"); this.works.set(w.key, w); }
  async getWork(uid: string, id: string) { return this.works.get(localKey(uid, id)); }
  async listWorks(uid: string) { return [...this.works.values()].filter((w) => w.uid === uid); }
  async markWorkSynced(uid: string, id: string, savedAtMs: number) {
    const w = this.works.get(localKey(uid, id));
    if (w && w.savedAtMs === savedAtMs) w.syncedAtMs = savedAtMs;
  }
  async putSketch(s: LocalSketch) { this.sketches.set(s.key, s); }
  async getSketch(uid: string, id: string) { return this.sketches.get(localKey(uid, id)); }
  async markSketchSynced(uid: string, id: string) { const s = this.sketches.get(localKey(uid, id)); if (s) s.synced = true; }
  async renameWork(uid: string, id: string, title: string) { const w = this.works.get(localKey(uid, id)); if (w) w.meta = { ...w.meta, title }; }
  async deleteWork(uid: string, id: string) { this.works.delete(localKey(uid, id)); }
  async deleteSketch(uid: string, id: string) { this.sketches.delete(localKey(uid, id)); }
  async deleteUser(uid: string) { for (const [k, w] of this.works) if (w.uid === uid) this.works.delete(k); for (const [k, s] of this.sketches) if (s.uid === uid) this.sketches.delete(k); }
}

class FakeRemote implements RemoteStore {
  uploaded: string[] = [];
  error: unknown = null;
  async uploadSketch(s: LocalSketch) { if (this.error) throw this.error; this.uploaded.push(`sketch:${s.sketchId}`); }
  async uploadWork(w: LocalWork) { if (this.error) throw this.error; this.uploaded.push(`work:${w.workId}`); }
}

function setup(online = true) {
  const local = new FakeLocal();
  const remote = new FakeRemote();
  const net = { online };
  let t = 1000;
  const sync = new WorkSync({ local, remote, isOnline: () => net.online, now: () => t++ });
  return { local, remote, net, sync };
}

describe("isOfflineError", () => {
  it("is offline whenever the browser says so", () => expect(isOfflineError(new Error("x"), false)).toBe(true));
  it("knows firebase's network failures", () => {
    expect(isOfflineError({ code: "storage/retry-limit-exceeded" }, true)).toBe(true);
    expect(isOfflineError({ code: "unavailable" }, true)).toBe(true);
    expect(isOfflineError(new OfflineError("timed out"), true)).toBe(true);
    expect(isOfflineError(new TypeError("Failed to fetch"), true)).toBe(true);
  });
  it("does not call a refusal offline", () => {
    expect(isOfflineError({ code: "storage/unauthorized" }, true)).toBe(false);
    expect(isOfflineError({ code: "permission-denied" }, true)).toBe(false);
    expect(isOfflineError(new Error("boom"), true)).toBe(false);
  });
});

describe("WorkSync", () => {
  it("saves on the device first, then uploads, and marks the work synced", async () => {
    const { sync, local, remote } = setup();
    const statuses: string[] = [];
    sync.onStatus((s) => statuses.push(s));
    expect(await sync.save(work())).toBe("saved");
    expect(statuses).toEqual(["saving", "saved"]);
    expect(remote.uploaded).toEqual(["work:w1"]);
    const stored = local.works.get(localKey("u1", "w1"))!;
    expect(stored.syncedAtMs).toBe(stored.savedAtMs);
  });

  it("offline: the work is on the device, not uploaded, and says so", async () => {
    const { sync, local, remote } = setup(false);
    expect(await sync.save(work())).toBe("offline");
    expect(remote.uploaded).toEqual([]);
    expect(local.works.get(localKey("u1", "w1"))!.syncedAtMs).toBeNull();
  });

  it("goes online: flush uploads what is waiting", async () => {
    const { sync, local, remote, net } = setup(false);
    await sync.save(work("a"));
    await sync.save(work("b"));
    net.online = true;
    expect(await sync.flush(await local.listWorks("u1"))).toBe("saved");
    expect(remote.uploaded.sort()).toEqual(["work:a", "work:b"]);
    expect((await local.listWorks("u1")).every((w) => w.syncedAtMs === w.savedAtMs)).toBe(true);
    // nothing left: a second flush is a no-op
    remote.uploaded.length = 0;
    await sync.flush(await local.listWorks("u1"));
    expect(remote.uploaded).toEqual([]);
  });

  it("a network error while online is offline, a refusal is a failure; both keep the work on the device", async () => {
    const a = setup();
    a.remote.error = { code: "storage/retry-limit-exceeded" };
    expect(await a.sync.save(work())).toBe("offline");
    const b = setup();
    b.remote.error = { code: "storage/unauthorized" };
    expect(await b.sync.save(work())).toBe("failed");
    expect(b.local.works.size).toBe(1);
  });

  it("uploads the sketch before the work that uses it, once", async () => {
    const { sync, remote, local } = setup();
    await sync.saveSketch(sketch("s1"));
    await sync.save(work("w1", "s1"));
    await sync.save(work("w1", "s1"));
    expect(remote.uploaded).toEqual(["sketch:s1", "work:w1", "work:w1"]);
    expect(local.sketches.get(localKey("u1", "s1"))!.synced).toBe(true);
  });

  it("a sketch that cannot be uploaded keeps the work unsynced", async () => {
    const { sync, remote, local } = setup();
    await sync.saveSketch(sketch("s1"));
    remote.error = { code: "unavailable" };
    expect(await sync.save(work("w1", "s1"))).toBe("offline");
    expect(local.works.get(localKey("u1", "w1"))!.syncedAtMs).toBeNull();
    expect(local.sketches.get(localKey("u1", "s1"))!.synced).toBe(false);
  });

  it("fails, without uploading, when the device cannot store the work", async () => {
    const { sync, local, remote } = setup();
    local.failPut = true;
    expect(await sync.save(work())).toBe("failed");
    expect(remote.uploaded).toEqual([]);
  });

  it("never runs two uploads at once and keeps their order", async () => {
    const { sync, remote } = setup();
    const order: string[] = [];
    const original = remote.uploadWork.bind(remote);
    let running = 0;
    remote.uploadWork = async (w) => {
      running++;
      expect(running).toBe(1);
      await new Promise((r) => setTimeout(r, 5));
      await original(w);
      order.push(w.workId);
      running--;
    };
    await Promise.all([sync.save(work("a")), sync.save(work("b")), sync.save(work("c"))]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("paths follow the storage layout", () => {
    expect(workPaths("u", "w")).toEqual({ ink: "users/u/works/w/ink.bin", trauma: "users/u/works/w/trauma.bin", preview: "users/u/works/w/preview.webp" });
    expect(sketchPaths("u", "s", "image/jpeg")).toEqual({ original: "users/u/sketches/s/original.jpg", stencil: "users/u/sketches/s/stencil.png" });
  });
});
