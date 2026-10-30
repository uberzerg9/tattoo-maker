import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VITE_DISABLE_WRITES=true (preview-channel builds): not one Firestore, Storage or Cloud Function write may be sent.
 * The Firebase SDK is replaced by spies, so a call that slips through shows up here.
 */
const writes = vi.hoisted(() => ({
  setDoc: vi.fn(), updateDoc: vi.fn(), addDoc: vi.fn(), deleteDoc: vi.fn(), runTransaction: vi.fn(), writeBatch: vi.fn(),
  uploadBytes: vi.fn(), deleteObject: vi.fn(), callable: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  Timestamp: { fromDate: (d: Date) => d, fromMillis: (n: number) => n }, serverTimestamp: () => "server-time",
  collection: () => ({}), doc: () => ({}), getDoc: vi.fn(), getDocs: vi.fn(), limit: vi.fn(), onSnapshot: vi.fn(), orderBy: vi.fn(), query: vi.fn(), where: vi.fn(),
  setDoc: writes.setDoc, updateDoc: writes.updateDoc, addDoc: writes.addDoc, deleteDoc: writes.deleteDoc, runTransaction: writes.runTransaction, writeBatch: writes.writeBatch,
}));
vi.mock("firebase/storage", () => ({ ref: () => ({}), getBlob: vi.fn(), uploadBytes: writes.uploadBytes, deleteObject: writes.deleteObject }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => writes.callable }));
vi.mock("firebase/auth", () => ({}));
vi.mock("./firebase", () => ({ auth: {}, db: {}, storage: {}, functions: {} }));
vi.mock("../i18n", () => ({ default: { changeLanguage: vi.fn(async () => undefined) } }));

const anyWrite = () => Object.values(writes).some((spy) => spy.mock.calls.length > 0);

beforeEach(() => {
  vi.stubEnv("VITE_DISABLE_WRITES", "true");
  Object.values(writes).forEach((spy) => spy.mockReset());
});
afterEach(() => vi.unstubAllEnvs());

const work = { uid: "u", workId: "w", ink: new Blob(), trauma: new Blob(), preview: new Blob(), meta: { title: "t", sketchId: null, skinTone: "t2", sizeCm: null, presetsVersion: 1, state: {}, createdAtMs: 1 } };
const sketch = { uid: "u", sketchId: "s", original: new Blob(), originalType: "image/png", stencil: new Blob(), threshold: 1, lineWeightPx: 1, removeFills: false, fileName: "a.png", createdAtMs: 1 };

describe("preview build (VITE_DISABLE_WRITES=true)", () => {
  it("sends no work or sketch upload, rename or delete", async () => {
    const { FirebaseRemote, renameWorkRemote, deleteWorkRemote, deleteSketchRemote } = await import("../features/works/workRemote");
    const { WritesDisabledError } = await import("./features");
    const remote = new FirebaseRemote();
    await expect(remote.uploadSketch(sketch as never)).rejects.toBeInstanceOf(WritesDisabledError);
    await expect(remote.uploadWork(work as never)).rejects.toBeInstanceOf(WritesDisabledError);
    await expect(renameWorkRemote("u", "w", "new")).rejects.toBeInstanceOf(WritesDisabledError);
    await expect(deleteWorkRemote("u", "w")).rejects.toBeInstanceOf(WritesDisabledError);
    await expect(deleteSketchRemote("u", "s")).rejects.toBeInstanceOf(WritesDisabledError);
    expect(anyWrite()).toBe(false);
  });

  it("sends no profile settings, language or panel layout writes (language still switches on screen)", async () => {
    const { saveSettings, setLanguage, savePanelLayout } = await import("../features/profile/profileService");
    const { WritesDisabledError } = await import("./features");
    await expect(saveSettings("u", { name: "A", skinTone: "t2", machineHz: 85, units: "cm" })).rejects.toBeInstanceOf(WritesDisabledError);
    await expect(setLanguage("u", "ru")).resolves.toBeUndefined();
    await expect(savePanelLayout("u", {} as never)).resolves.toBeUndefined();
    expect(anyWrite()).toBe(false);
  });

  it("records no practice session", async () => {
    const { writeSession } = await import("../features/session/sessionService");
    await writeSession("u", { workId: "w", startedAt: new Date(), endedAt: new Date(), passes: 1, deviationMm: 1, traumaLevel: "low" });
    expect(anyWrite()).toBe(false);
  });

  it("creates no profile (so no sign-up completes) and deletes no account", async () => {
    const { claimProfile } = await import("../features/auth/authService");
    const { deleteAccountOnServer } = await import("../features/profile/accountService");
    const { WritesDisabledError } = await import("./features");
    await expect(claimProfile("u", { name: "A", username: "abc", level: "never", language: "en" })).rejects.toBeInstanceOf(WritesDisabledError);
    await expect(deleteAccountOnServer()).rejects.toBeInstanceOf(WritesDisabledError);
    expect(anyWrite()).toBe(false);
  });
});

describe("normal build", () => {
  it("still writes: the guard is the only thing in the way", async () => {
    vi.stubEnv("VITE_DISABLE_WRITES", "");
    const { writeSession } = await import("../features/session/sessionService");
    await writeSession("u", { workId: "w", startedAt: new Date(), endedAt: new Date(), passes: 1, deviationMm: 1, traumaLevel: "low" });
    expect(writes.addDoc).toHaveBeenCalledTimes(1);
  });
});
