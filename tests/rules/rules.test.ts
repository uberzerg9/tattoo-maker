import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { Timestamp, addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

const ME = "alice";
const OTHER = "bob";
const WORK = "work-1";
const SKETCH = "sketch-1";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-tattoo-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8280 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9399 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

const as = (uid: string) => env.authenticatedContext(uid);
const anon = () => env.unauthenticatedContext();

/** What the app writes for a work: see workRemote.ts. */
const workData = (uid = ME, id = WORK, extra: Record<string, unknown> = {}) => ({
  title: "Rose",
  sketchId: SKETCH,
  skinTone: "t2",
  inkPath: `users/${uid}/works/${id}/ink.bin`,
  traumaPath: `users/${uid}/works/${id}/trauma.bin`,
  previewPath: `users/${uid}/works/${id}/preview.webp`,
  sizeCm: 12,
  presetsVersion: 1,
  state: {
    version: 1,
    presetsVersion: 1,
    strokes: 4,
    deviation: { sum: 1.5, count: 10 },
    supply: { caps: { black: 0.96 }, needles: { "rl-7": { level: 0.4, tone: 0 } } },
    placement: { centerXMm: 100, centerYMm: 75, rotationDeg: 0, scale: 1 },
  },
  createdAt: Timestamp.fromMillis(1_700_000_000_000),
  updatedAt: serverTimestamp(),
  ...extra,
});

const sketchData = (uid = ME, id = SKETCH, extra: Record<string, unknown> = {}) => ({
  originalPath: `users/${uid}/sketches/${id}/original.png`,
  stencilPath: `users/${uid}/sketches/${id}/stencil.png`,
  threshold: 140,
  lineWeight: 2.5,
  removeFills: true,
  fileName: "rose.png",
  createdAt: Timestamp.fromMillis(1_700_000_000_000),
  ...extra,
});

const workRef = (ctx: ReturnType<typeof as>, uid = ME, id = WORK) => doc(ctx.firestore(), "users", uid, "works", id);
const sketchRef = (ctx: ReturnType<typeof as>, uid = ME, id = SKETCH) => doc(ctx.firestore(), "users", uid, "sketches", id);

async function seedWork(data: Record<string, unknown> = workData()) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", ME, "works", WORK), { ...data, updatedAt: Timestamp.now() });
  });
}

describe("Firestore: works", () => {
  it("the owner can create, read, list and update their work", async () => {
    const ctx = as(ME);
    await assertSucceeds(setDoc(workRef(ctx), workData()));
    await assertSucceeds(getDoc(workRef(ctx)));
    await assertSucceeds(getDocs(collection(ctx.firestore(), "users", ME, "works")));
    await assertSucceeds(setDoc(workRef(ctx), workData()));
  });

  it("only the owner can delete a work", async () => {
    await seedWork();
    await assertFails(deleteDoc(workRef(as(OTHER), ME)));
    await assertFails(deleteDoc(workRef(anon(), ME)));
    await assertSucceeds(deleteDoc(workRef(as(ME))));
  });

  it("renaming keeps the work valid: the title can change, and updatedAt is the server's time", async () => {
    await seedWork();
    const ctx = as(ME);
    await assertSucceeds(updateDoc(workRef(ctx), { title: "Renamed", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(workRef(ctx), { title: "x".repeat(500), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(workRef(ctx), { title: "No time" })); // updatedAt would still be the old one
  });

  it("another signed-in user cannot read, list, create, update or delete it", async () => {
    await seedWork();
    const ctx = as(OTHER);
    await assertFails(getDoc(workRef(ctx, ME)));
    await assertFails(getDocs(collection(ctx.firestore(), "users", ME, "works")));
    await assertFails(setDoc(workRef(ctx, ME, "new"), workData(ME, "new")));
    await assertFails(updateDoc(workRef(ctx, ME), { title: "mine now" }));
    await assertFails(deleteDoc(workRef(ctx, ME)));
  });

  it("nobody who is signed out can touch it", async () => {
    await seedWork();
    const ctx = anon();
    await assertFails(getDoc(workRef(ctx)));
    await assertFails(setDoc(workRef(ctx, ME, "new"), workData(ME, "new")));
  });

  it("a work must have exactly the fields the app writes", async () => {
    const ctx = as(ME);
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { admin: true })));
    const { title: _title, ...withoutTitle } = workData();
    void _title;
    await assertFails(setDoc(workRef(ctx), withoutTitle));
  });

  it("its file paths must point at its own folder", async () => {
    const ctx = as(ME);
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { inkPath: `users/${OTHER}/works/${WORK}/ink.bin` })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { previewPath: `users/${ME}/works/other-work/preview.webp` })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { traumaPath: `users/${ME}/works/${WORK}/../x` })));
  });

  it("updatedAt must be the server's time, and createdAt cannot change", async () => {
    const ctx = as(ME);
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { updatedAt: Timestamp.fromMillis(1) })));
    await seedWork();
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { createdAt: Timestamp.fromMillis(2_000_000_000_000) })));
  });

  it("checks types and ranges", async () => {
    const ctx = as(ME);
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { skinTone: "t9" })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { title: "" })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { title: "x".repeat(500) })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { sizeCm: "big" })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { presetsVersion: "1" })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { state: "nope" })));
    await assertSucceeds(setDoc(workRef(ctx), workData(ME, WORK, { sketchId: null, sizeCm: null })));
  });

  it("the work's state holds only what the engine saves", async () => {
    const ctx = as(ME);
    const ok = workData().state;
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { state: { ...ok, extra: "x" } })));
  });

  it("a work id must be a plain id", async () => {
    const ctx = as(ME);
    await assertFails(setDoc(doc(ctx.firestore(), "users", ME, "works", "a b"), workData(ME, "a b")));
  });
});

describe("Firestore: sketches", () => {
  it("the owner can create, read and update; nobody else can do anything", async () => {
    await assertSucceeds(setDoc(sketchRef(as(ME)), sketchData()));
    await assertSucceeds(getDoc(sketchRef(as(ME))));
    await assertSucceeds(setDoc(sketchRef(as(ME)), sketchData()));
    await assertFails(getDoc(sketchRef(as(OTHER), ME)));
    await assertFails(setDoc(sketchRef(as(OTHER), ME, "x"), sketchData(ME, "x")));
    await assertFails(getDoc(sketchRef(anon(), ME)));
  });

  it("only the owner can delete a sketch", async () => {
    await assertSucceeds(setDoc(sketchRef(as(ME)), sketchData()));
    await assertFails(deleteDoc(sketchRef(as(OTHER), ME)));
    await assertSucceeds(deleteDoc(sketchRef(as(ME))));
  });

  it("has exactly the fields the app writes, with paths in its own folder", async () => {
    const ctx = as(ME);
    await assertFails(setDoc(sketchRef(ctx), sketchData(ME, SKETCH, { extra: 1 })));
    await assertFails(setDoc(sketchRef(ctx), sketchData(ME, SKETCH, { originalPath: `users/${OTHER}/sketches/${SKETCH}/original.png` })));
    await assertFails(setDoc(sketchRef(ctx), sketchData(ME, SKETCH, { stencilPath: `users/${ME}/sketches/${SKETCH}/evil.exe` })));
    await assertFails(setDoc(sketchRef(ctx), sketchData(ME, SKETCH, { threshold: 999 })));
    await assertFails(setDoc(sketchRef(ctx), sketchData(ME, SKETCH, { removeFills: "yes" })));
  });
});

const sessionsOf = (ctx: ReturnType<typeof as>, uid = ME) => collection(ctx.firestore(), "users", uid, "sessions");

/** What writeSession() sends: see sessionService.ts. Ten minutes that ended five seconds ago. */
const sessionData = (extra: Record<string, unknown> = {}) => {
  const end = Date.now() - 5_000;
  return {
    workId: WORK,
    startedAt: Timestamp.fromMillis(end - 10 * 60_000),
    endedAt: Timestamp.fromMillis(end),
    passes: 3,
    deviationMm: 0.4,
    traumaLevel: "low",
    ...extra,
  };
};

describe("Firestore: sessions", () => {
  it("the owner can add a session and read it back; it cannot be changed or deleted", async () => {
    const ctx = as(ME);
    const created = await assertSucceeds(addDoc(sessionsOf(ctx), sessionData()));
    await assertSucceeds(getDoc(created));
    await assertSucceeds(getDocs(sessionsOf(ctx)));
    await assertFails(updateDoc(created, { passes: 99 }));
    await assertFails(deleteDoc(created));
  });

  it("nobody else can add or read sessions, signed in or not", async () => {
    const created = await assertSucceeds(addDoc(sessionsOf(as(ME)), sessionData()));
    await assertFails(addDoc(sessionsOf(as(OTHER), ME), sessionData()));
    await assertFails(addDoc(sessionsOf(anon(), ME), sessionData()));
    await assertFails(getDoc(doc(as(OTHER).firestore(), created.path)));
    await assertFails(getDocs(sessionsOf(as(OTHER), ME)));
    await assertFails(getDocs(sessionsOf(anon(), ME)));
  });

  it("has exactly the fields the app writes: no extras (not even `counted`), none missing", async () => {
    const ctx = as(ME);
    await assertFails(addDoc(sessionsOf(ctx), sessionData({ counted: true })));
    await assertFails(addDoc(sessionsOf(ctx), sessionData({ extra: 1 })));
    for (const key of ["workId", "startedAt", "endedAt", "passes", "deviationMm", "traumaLevel"]) {
      const data: Record<string, unknown> = sessionData();
      delete data[key];
      await assertFails(addDoc(sessionsOf(ctx), data));
    }
  });

  it("workId is a plain id; times are timestamps", async () => {
    const ctx = as(ME);
    await assertFails(addDoc(sessionsOf(ctx), sessionData({ workId: 7 })));
    await assertFails(addDoc(sessionsOf(ctx), sessionData({ workId: "a b" })));
    await assertFails(addDoc(sessionsOf(ctx), sessionData({ workId: "" })));
    await assertFails(addDoc(sessionsOf(ctx), sessionData({ startedAt: Date.now() - 60_000 })));
    await assertFails(addDoc(sessionsOf(ctx), sessionData({ endedAt: "now" })));
  });

  it("endedAt must be after startedAt and not in the future", async () => {
    const ctx = as(ME);
    const t = Date.now() - 60_000;
    await assertFails(addDoc(sessionsOf(ctx), sessionData({ startedAt: Timestamp.fromMillis(t), endedAt: Timestamp.fromMillis(t) })));
    await assertFails(addDoc(sessionsOf(ctx), sessionData({ startedAt: Timestamp.fromMillis(t), endedAt: Timestamp.fromMillis(t - 1000) })));
    await assertFails(addDoc(sessionsOf(ctx), sessionData({ endedAt: Timestamp.fromMillis(Date.now() + 3_600_000) })));
    await assertSucceeds(addDoc(sessionsOf(ctx), sessionData({ startedAt: Timestamp.fromMillis(t), endedAt: Timestamp.fromMillis(t + 1000) })));
  });

  it("a session is shorter than 12 hours", async () => {
    const ctx = as(ME);
    const end = Date.now() - 5_000;
    const hours = (h: number, extraMs = 0) => ({ startedAt: Timestamp.fromMillis(end - h * 3_600_000 - extraMs), endedAt: Timestamp.fromMillis(end) });
    await assertSucceeds(addDoc(sessionsOf(ctx), sessionData(hours(11.9))));
    await assertFails(addDoc(sessionsOf(ctx), sessionData(hours(12))));
    await assertFails(addDoc(sessionsOf(ctx), sessionData(hours(48))));
  });

  it("passes is a whole number from 0 to 100000", async () => {
    const ctx = as(ME);
    for (const ok of [0, 1, 100000]) await assertSucceeds(addDoc(sessionsOf(ctx), sessionData({ passes: ok })));
    for (const bad of [-1, 100001, 1.5, "3", null]) await assertFails(addDoc(sessionsOf(ctx), sessionData({ passes: bad })));
  });

  it("deviationMm is a number from 0 to 50", async () => {
    const ctx = as(ME);
    for (const ok of [0, 0.37, 50]) await assertSucceeds(addDoc(sessionsOf(ctx), sessionData({ deviationMm: ok })));
    for (const bad of [-0.1, 50.1, 1e9, "1", null]) await assertFails(addDoc(sessionsOf(ctx), sessionData({ deviationMm: bad })));
  });

  it("traumaLevel is one of low, medium, high", async () => {
    const ctx = as(ME);
    for (const ok of ["low", "medium", "high"]) await assertSucceeds(addDoc(sessionsOf(ctx), sessionData({ traumaLevel: ok })));
    for (const bad of ["severe", "LOW", "", 2, null]) await assertFails(addDoc(sessionsOf(ctx), sessionData({ traumaLevel: bad })));
  });
});

describe("Firestore: other paths", () => {
  it("unknown paths stay closed", async () => {
    await assertFails(setDoc(doc(as(ME).firestore(), "users", ME, "notes", "n"), { a: 1 }));
    await assertFails(setDoc(doc(as(ME).firestore(), "anything", "x"), { a: 1 }));
  });

  it("cartridge presets are readable when signed in and never writable from the client", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "cartridgePresets", "rl-7"), { version: 1 });
    });
    await assertSucceeds(getDoc(doc(as(ME).firestore(), "cartridgePresets", "rl-7")));
    await assertFails(getDoc(doc(anon().firestore(), "cartridgePresets", "rl-7")));
    await assertFails(setDoc(doc(as(ME).firestore(), "cartridgePresets", "rl-7"), { version: 2 }));
    await assertFails(setDoc(doc(as(ME).firestore(), "cartridgePresets", "new"), { version: 1 }));
    await assertFails(deleteDoc(doc(as(ME).firestore(), "cartridgePresets", "rl-7")));
  });
});

const bytes = (n: number) => new Uint8Array(n).fill(7);
const png = { contentType: "image/png" };
const storageRef = (ctx: ReturnType<typeof as>, path: string) => ref(ctx.storage(), path);

describe("Storage: works", () => {
  const dir = `users/${ME}/works/${WORK}`;

  it("the owner can upload the three files of a work and read them back", async () => {
    const ctx = as(ME);
    await assertSucceeds(uploadBytes(storageRef(ctx, `${dir}/ink.bin`), bytes(1000), { contentType: "application/octet-stream" }));
    await assertSucceeds(uploadBytes(storageRef(ctx, `${dir}/trauma.bin`), bytes(1000), { contentType: "application/octet-stream" }));
    await assertSucceeds(uploadBytes(storageRef(ctx, `${dir}/preview.webp`), bytes(1000), { contentType: "image/webp" }));
    await assertSucceeds(getBytes(storageRef(ctx, `${dir}/ink.bin`)));
    await assertSucceeds(uploadBytes(storageRef(ctx, `${dir}/ink.bin`), bytes(2000), { contentType: "application/octet-stream" })); // overwrite
  });

  it("another user cannot read or write them, nor can a signed-out visitor", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `${dir}/ink.bin`), bytes(10), { contentType: "application/octet-stream" });
    });
    await assertFails(getBytes(storageRef(as(OTHER), `${dir}/ink.bin`)));
    await assertFails(uploadBytes(storageRef(as(OTHER), `${dir}/ink.bin`), bytes(10), { contentType: "application/octet-stream" }));
    await assertFails(uploadBytes(storageRef(as(OTHER), `users/${OTHER}/works/${WORK}/../../${ME}/works/${WORK}/ink.bin`), bytes(10)));
    await assertFails(getBytes(storageRef(anon(), `${dir}/ink.bin`)));
    await assertFails(uploadBytes(storageRef(anon(), `${dir}/ink.bin`), bytes(10), { contentType: "application/octet-stream" }));
  });

  it("only the owner can delete a file", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `${dir}/ink.bin`), bytes(10), { contentType: "application/octet-stream" });
    });
    await assertFails(deleteObject(storageRef(as(OTHER), `${dir}/ink.bin`)));
    await assertFails(deleteObject(storageRef(anon(), `${dir}/ink.bin`)));
    await assertSucceeds(deleteObject(storageRef(as(ME), `${dir}/ink.bin`)));
  });

  it("only the three file names are allowed", async () => {
    const ctx = as(ME);
    await assertFails(uploadBytes(storageRef(ctx, `${dir}/evil.html`), bytes(10), { contentType: "text/html" }));
    await assertFails(uploadBytes(storageRef(ctx, `${dir}/extra.bin`), bytes(10), { contentType: "application/octet-stream" }));
    await assertFails(uploadBytes(storageRef(ctx, `${dir}/nested/ink.bin`), bytes(10), { contentType: "application/octet-stream" }));
  });

  it("limits sizes and content types", async () => {
    const ctx = as(ME);
    await assertFails(uploadBytes(storageRef(ctx, `${dir}/ink.bin`), bytes(26 * 1024 * 1024), { contentType: "application/octet-stream" }));
    await assertFails(uploadBytes(storageRef(ctx, `${dir}/ink.bin`), bytes(10), { contentType: "text/html" }));
    await assertFails(uploadBytes(storageRef(ctx, `${dir}/preview.webp`), bytes(3 * 1024 * 1024), { contentType: "image/webp" }));
    await assertFails(uploadBytes(storageRef(ctx, `${dir}/preview.webp`), bytes(10), { contentType: "text/html" }));
  });
});

describe("Storage: sketches", () => {
  const dir = `users/${ME}/sketches/${SKETCH}`;

  it("the owner can upload the original and the stencil and read them back", async () => {
    const ctx = as(ME);
    await assertSucceeds(uploadBytes(storageRef(ctx, `${dir}/original.png`), bytes(1000), png));
    await assertSucceeds(uploadBytes(storageRef(ctx, `${dir}/original.jpg`), bytes(1000), { contentType: "image/jpeg" }));
    await assertSucceeds(uploadBytes(storageRef(ctx, `${dir}/original.webp`), bytes(1000), { contentType: "image/webp" }));
    await assertSucceeds(uploadBytes(storageRef(ctx, `${dir}/stencil.png`), bytes(1000), png));
    await assertSucceeds(getBytes(storageRef(ctx, `${dir}/stencil.png`)));
  });

  it("only the owner can delete the sketch files", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `${dir}/original.png`), bytes(10), png);
    });
    await assertFails(deleteObject(storageRef(as(OTHER), `${dir}/original.png`)));
    await assertSucceeds(deleteObject(storageRef(as(ME), `${dir}/original.png`)));
  });

  it("no one else can read or write; only those file names and image types are allowed; 10 MB at most", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `${dir}/original.png`), bytes(10), png);
    });
    await assertFails(getBytes(storageRef(as(OTHER), `${dir}/original.png`)));
    await assertFails(uploadBytes(storageRef(as(OTHER), `${dir}/original.png`), bytes(10), png));
    await assertFails(getBytes(storageRef(anon(), `${dir}/original.png`)));
    const ctx = as(ME);
    await assertFails(uploadBytes(storageRef(ctx, `${dir}/anything.png`), bytes(10), png));
    await assertFails(uploadBytes(storageRef(ctx, `${dir}/original.png`), bytes(10), { contentType: "text/html" }));
    await assertFails(uploadBytes(storageRef(ctx, `${dir}/original.png`), bytes(11 * 1024 * 1024), png));
  });
});

describe("Storage: everything else is closed", () => {
  it("nothing outside the works and sketches folders", async () => {
    await assertFails(uploadBytes(storageRef(as(ME), `users/${ME}/other/file.png`), bytes(10), png));
    await assertFails(uploadBytes(storageRef(as(ME), `public/file.png`), bytes(10), png));
  });
});

/** What the sign-up transaction writes: see claimProfile() in src/features/auth/authService.ts. */
const profileData = (username: string, extra: Record<string, unknown> = {}) => ({
  name: "Alex",
  username,
  level: "never",
  language: "en",
  createdAt: serverTimestamp(),
  settings: { skinTone: "t2", machineHz: 85, units: "cm" },
  ...extra,
});

async function claim(uid: string, username: string) {
  const db = as(uid).firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, "usernames", username), { uid });
  batch.set(doc(db, "users", uid), profileData(username));
  return batch.commit();
}

describe("Firestore: accounts and usernames", () => {
  it("a new account can take a username and create its profile together", async () => {
    await assertSucceeds(claim(ME, "alice_ink"));
    await assertSucceeds(getDoc(doc(as(ME).firestore(), "users", ME)));
    await assertSucceeds(getDoc(doc(as(OTHER).firestore(), "usernames", "alice_ink"))); // anyone signed in can look a name up
  });

  it("a username can only be taken once", async () => {
    await assertSucceeds(claim(ME, "alice_ink"));
    await assertFails(claim(OTHER, "alice_ink"));
    await assertSucceeds(claim(OTHER, "bob_ink"));
  });

  it("a username must point at the person taking it, and match the pattern", async () => {
    const db = as(ME).firestore();
    await assertFails(setDoc(doc(db, "usernames", "stolen_name"), { uid: OTHER }));
    for (const bad of ["ab", "x".repeat(21), "Alice", "a b c", "a-b-c", "a.b.c"]) {
      await assertFails(setDoc(doc(db, "usernames", bad), { uid: ME }));
    }
    await assertFails(setDoc(doc(anon().firestore(), "usernames", "anon_name"), { uid: ME }));
  });

  it("a username cannot be changed, released or read by someone signed out", async () => {
    await assertSucceeds(claim(ME, "alice_ink"));
    const db = as(ME).firestore();
    await assertFails(setDoc(doc(db, "usernames", "alice_ink"), { uid: OTHER }));
    await assertFails(deleteDoc(doc(db, "usernames", "alice_ink")));
    await assertFails(getDoc(doc(anon().firestore(), "usernames", "alice_ink")));
  });

  it("a profile is the owner's alone: nobody creates or reads someone else's", async () => {
    await assertFails(setDoc(doc(as(OTHER).firestore(), "users", ME), profileData("sneaky_one")));
    await assertSucceeds(claim(ME, "alice_ink"));
    await assertFails(getDoc(doc(as(OTHER).firestore(), "users", ME)));
  });

  it("statistics cannot be written by the client, at creation or later", async () => {
    const db = as(ME).firestore();
    await assertFails(setDoc(doc(db, "users", ME), profileData("alice_ink", { stats: { sessions: 99 } })));
    await assertSucceeds(claim(ME, "alice_ink"));
    await assertFails(updateDoc(doc(db, "users", ME), { stats: { sessions: 99 } }));
    await assertFails(updateDoc(doc(db, "users", ME), { username: "somebody_else" }));
    await assertFails(updateDoc(doc(db, "users", ME), { createdAt: Timestamp.fromMillis(1) }));
    await assertSucceeds(updateDoc(doc(db, "users", ME), { name: "Alex Ink" }));
    await assertFails(deleteDoc(doc(db, "users", ME)));
  });

  it("a profile can only carry a username its owner has claimed", async () => {
    await assertSucceeds(claim(OTHER, "bobs_name"));
    await assertFails(setDoc(doc(as(ME).firestore(), "users", ME), profileData("bobs_name"))); // someone else's
    await assertFails(setDoc(doc(as(ME).firestore(), "users", ME), profileData("unclaimed_one"))); // nobody's
  });
});

/** Writes a profile with its username claimed in the same batch, as the app does, with `extra` overriding fields. */
function claimWith(extra: Record<string, unknown>, username = "alice_ink", uid = ME) {
  const db = as(uid).firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, "usernames", username), { uid });
  batch.set(doc(db, "users", uid), profileData(username, extra));
  return batch.commit();
}

const withoutKey = (extra: Record<string, unknown>, key: string) => {
  const data: Record<string, unknown> = profileData("alice_ink", extra);
  delete data[key];
  return data;
};

const layout = () => ({
  positions: Object.fromEntries(["carts", "caps", "machine", "skin", "stencil"].map((id, i) => [id, { side: i % 2 ? "right" : "left", x: 24, y: 86 + i }])),
  open: Object.fromEntries(["carts", "caps", "machine", "skin", "stencil"].map((id) => [id, true])),
});

describe("Firestore: users, field by field", () => {
  const settings = { skinTone: "t2", machineHz: 85, units: "cm" };

  it("a profile has exactly the fields the app writes", async () => {
    await assertFails(claimWith({ avatarUrl: "https://x.test/a.png" }));
    await assertFails(claimWith({ admin: true }));
    for (const key of ["name", "level", "language", "settings", "createdAt"]) {
      const db = as(ME).firestore();
      await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), "usernames", "alice_ink"), { uid: ME }));
      await assertFails(setDoc(doc(db, "users", ME), withoutKey({}, key)));
    }
  });

  it("name is a string of 1 to 60 characters", async () => {
    await assertSucceeds(claimWith({ name: "x".repeat(60) }));
    await env.clearFirestore();
    await assertFails(claimWith({ name: "" }));
    await assertFails(claimWith({ name: "x".repeat(61) }));
    await assertFails(claimWith({ name: 42 }));
    await assertFails(claimWith({ name: null }));
  });

  it("username must match the pattern as well as being claimed", async () => {
    for (const bad of ["AB", "ab", "x".repeat(21), "a-b-c", "a b c", "Alice"]) {
      await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), "usernames", bad), { uid: ME }));
      await assertFails(setDoc(doc(as(ME).firestore(), "users", ME), profileData(bad)));
    }
    await assertFails(setDoc(doc(as(ME).firestore(), "users", ME), profileData(String(7)))); // too short, and unclaimed
  });

  it("level is never, fake or apprentice", async () => {
    for (const ok of ["never", "fake", "apprentice"]) {
      await assertSucceeds(claimWith({ level: ok }));
      await env.clearFirestore();
    }
    for (const bad of ["pro", "NEVER", "", 1, null]) await assertFails(claimWith({ level: bad }));
  });

  it("language is en, ru or ro", async () => {
    for (const ok of ["en", "ru", "ro"]) {
      await assertSucceeds(claimWith({ language: ok }));
      await env.clearFirestore();
    }
    for (const bad of ["fr", "EN", "", 1, null]) await assertFails(claimWith({ language: bad }));
  });

  it("createdAt is the server's time at creation", async () => {
    await assertFails(claimWith({ createdAt: Timestamp.fromMillis(1_700_000_000_000) }));
    await assertFails(claimWith({ createdAt: Timestamp.now() }));
    await assertFails(claimWith({ createdAt: "today" }));
    await assertSucceeds(claimWith({}));
  });

  it("settings are a map with a known tone, whole Hz from 50 to 150, and cm or in", async () => {
    await assertFails(claimWith({ settings: "nope" }));
    await assertFails(claimWith({ settings: { ...settings, extra: 1 } }));
    for (const key of ["skinTone", "machineHz", "units"]) {
      const { [key]: _gone, ...rest } = settings as Record<string, unknown>;
      void _gone;
      await assertFails(claimWith({ settings: rest }));
    }
    for (const bad of ["t0", "t7", "T2", 2, null]) await assertFails(claimWith({ settings: { ...settings, skinTone: bad } }));
    for (const bad of [49, 151, 85.5, "85", null]) await assertFails(claimWith({ settings: { ...settings, machineHz: bad } }));
    for (const bad of ["mm", "CM", 1, null]) await assertFails(claimWith({ settings: { ...settings, units: bad } }));
    for (const ok of [50, 150]) {
      await assertSucceeds(claimWith({ settings: { ...settings, machineHz: ok } }));
      await env.clearFirestore();
    }
  });

  it("stats cannot be given at creation", async () => {
    await assertFails(claimWith({ stats: { sessions: 1 } }));
    await assertFails(claimWith({ stats: null }));
  });

  describe("updates", () => {
    const update = (data: Record<string, unknown>) => updateDoc(doc(as(ME).firestore(), "users", ME), data);
    beforeEach(async () => {
      await assertSucceeds(claim(ME, "alice_ink"));
    });

    it("accepts what the profile page and the workspace write", async () => {
      await assertSucceeds(update({ name: "Alex Ink", "settings.skinTone": "t5", "settings.machineHz": 120, "settings.units": "in" }));
      await assertSucceeds(update({ language: "ru" }));
      await assertSucceeds(update({ "settings.panelLayout": layout() }));
      await assertSucceeds(update({ "settings.panelLayout": { ...layout(), open: { ...layout().open, skin: false } } }));
    });

    it("keeps name, level and language valid", async () => {
      await assertFails(update({ name: "" }));
      await assertFails(update({ name: "x".repeat(61) }));
      await assertFails(update({ name: 5 }));
      await assertFails(update({ level: "pro" }));
      await assertFails(update({ language: "fr" }));
      await assertFails(update({ language: 1 }));
    });

    it("keeps settings valid", async () => {
      await assertFails(update({ "settings.skinTone": "t9" }));
      await assertFails(update({ "settings.machineHz": 10 }));
      await assertFails(update({ "settings.machineHz": 85.5 }));
      await assertFails(update({ "settings.units": "ft" }));
      await assertFails(update({ "settings.extra": true }));
      await assertFails(update({ settings: "gone" }));
    });

    it("keeps the panel layout valid", async () => {
      const l = layout();
      const positions = l.positions as Record<string, unknown>;
      const open = l.open as Record<string, unknown>;
      await assertFails(update({ "settings.panelLayout": "x" }));
      await assertFails(update({ "settings.panelLayout": { ...l, extra: 1 } }));
      await assertFails(update({ "settings.panelLayout": { positions: l.positions } })); // no `open`
      await assertFails(update({ "settings.panelLayout": { ...l, positions: { ...positions, extra: { side: "left", x: 1, y: 1 } } } }));
      await assertFails(update({ "settings.panelLayout": { ...l, positions: { ...positions, carts: { side: "top", x: 1, y: 1 } } } }));
      await assertFails(update({ "settings.panelLayout": { ...l, positions: { ...positions, carts: { side: "left", x: -1, y: 1 } } } }));
      await assertFails(update({ "settings.panelLayout": { ...l, positions: { ...positions, carts: { side: "left", x: 1, y: 4001 } } } }));
      await assertFails(update({ "settings.panelLayout": { ...l, positions: { ...positions, carts: { side: "left", x: "1", y: 1 } } } }));
      await assertFails(update({ "settings.panelLayout": { ...l, positions: { ...positions, carts: { side: "left", x: 1, y: 1, z: 1 } } } }));
      const { skin: _skin, ...fewer } = positions;
      void _skin;
      await assertFails(update({ "settings.panelLayout": { ...l, positions: fewer } }));
      await assertFails(update({ "settings.panelLayout": { ...l, open: { ...open, skin: "yes" } } }));
      await assertFails(update({ "settings.panelLayout": { ...l, open: { ...open, extra: true } } }));
    });

    it("no new fields, and the protected ones stay protected", async () => {
      await assertFails(update({ avatarUrl: "https://x.test/a.png" }));
      await assertFails(update({ isAdmin: true }));
      await assertFails(update({ stats: { sessions: 1 } }));
      await assertFails(update({ username: "somebody_else" }));
      await assertFails(update({ createdAt: Timestamp.fromMillis(1) }));
    });

    it("only the owner can update", async () => {
      await assertFails(updateDoc(doc(as(OTHER).firestore(), "users", ME), { name: "Mine now" }));
      await assertFails(updateDoc(doc(anon().firestore(), "users", ME), { name: "Mine now" }));
    });

    it("a profile that was already written keeps its stats when the owner updates it", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "users", ME), { stats: { sessions: 2, hours: 1, avgDeviationMm: 0.5, streakDays: 1, lastDay: "2026-10-30" } });
      });
      await assertSucceeds(update({ name: "Still Alex" }));
      await assertFails(update({ stats: { sessions: 3 } }));
    });
  });
});

describe("Firestore: usernames, field by field", () => {
  it("a username document holds the uid and nothing else", async () => {
    const db = as(ME).firestore();
    await assertFails(setDoc(doc(db, "usernames", "alice_ink"), { uid: ME, admin: true }));
    await assertFails(setDoc(doc(db, "usernames", "alice_ink"), {}));
    await assertFails(setDoc(doc(db, "usernames", "alice_ink"), { uid: 7 }));
    await assertSucceeds(setDoc(doc(db, "usernames", "alice_ink"), { uid: ME }));
  });
});

describe("Firestore: works, state in depth", () => {
  const ok = () => workData().state;
  const withState = (patch: Record<string, unknown>) => workData(ME, WORK, { state: { ...ok(), ...patch } });

  it("version, presetsVersion and strokes", async () => {
    const ctx = as(ME);
    await assertFails(setDoc(workRef(ctx), withState({ version: 2 })));
    await assertFails(setDoc(workRef(ctx), withState({ presetsVersion: 0 })));
    await assertFails(setDoc(workRef(ctx), withState({ presetsVersion: 1.5 })));
    await assertFails(setDoc(workRef(ctx), withState({ strokes: -1 })));
    await assertFails(setDoc(workRef(ctx), withState({ strokes: 1_000_001 })));
    await assertFails(setDoc(workRef(ctx), withState({ strokes: "4" })));
  });

  it("deviation is { sum >= 0, count: whole >= 0 }", async () => {
    const ctx = as(ME);
    await assertFails(setDoc(workRef(ctx), withState({ deviation: "x" })));
    await assertFails(setDoc(workRef(ctx), withState({ deviation: { sum: 1 } })));
    await assertFails(setDoc(workRef(ctx), withState({ deviation: { sum: -1, count: 1 } })));
    await assertFails(setDoc(workRef(ctx), withState({ deviation: { sum: 1, count: 1.5 } })));
    await assertFails(setDoc(workRef(ctx), withState({ deviation: { sum: 1, count: 1, extra: 1 } })));
    await assertSucceeds(setDoc(workRef(ctx), withState({ deviation: { sum: 0, count: 0 } })));
  });

  it("supply has caps and needles, and only the known cartridges", async () => {
    const ctx = as(ME);
    await assertFails(setDoc(workRef(ctx), withState({ supply: "x" })));
    await assertFails(setDoc(workRef(ctx), withState({ supply: { caps: {} } })));
    await assertFails(setDoc(workRef(ctx), withState({ supply: { caps: {}, needles: {}, extra: 1 } })));
    await assertFails(setDoc(workRef(ctx), withState({ supply: { caps: "x", needles: {} } })));
    await assertFails(setDoc(workRef(ctx), withState({ supply: { caps: {}, needles: { "evil-1": { level: 1, tone: 0 } } } })));
    await assertFails(setDoc(workRef(ctx), withState({ supply: { caps: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`c${i}`, 1])), needles: {} } })));
    await assertSucceeds(setDoc(workRef(ctx), withState({ supply: { caps: {}, needles: {} } })));
  });

  it("placement is null or four numbers with a positive scale", async () => {
    const ctx = as(ME);
    const placement = { centerXMm: 1, centerYMm: 2, rotationDeg: 3, scale: 1 };
    await assertSucceeds(setDoc(workRef(ctx), withState({ placement: null })));
    await assertFails(setDoc(workRef(ctx), withState({ placement: "x" })));
    await assertFails(setDoc(workRef(ctx), withState({ placement: { ...placement, extra: 1 } })));
    await assertFails(setDoc(workRef(ctx), withState({ placement: { centerXMm: 1, centerYMm: 2, rotationDeg: 3 } })));
    await assertFails(setDoc(workRef(ctx), withState({ placement: { ...placement, scale: 0 } })));
    await assertFails(setDoc(workRef(ctx), withState({ placement: { ...placement, rotationDeg: "3" } })));
  });

  it("the other work fields: bounds, sketchId, missing fields", async () => {
    const ctx = as(ME);
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { sizeCm: 0 })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { sizeCm: 31 })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { sketchId: "a b" })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { sketchId: 5 })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { presetsVersion: 0 })));
    await assertFails(setDoc(workRef(ctx), workData(ME, WORK, { createdAt: "yesterday" })));
    for (const key of ["title", "sketchId", "skinTone", "inkPath", "traumaPath", "previewPath", "sizeCm", "presetsVersion", "state", "createdAt", "updatedAt"]) {
      const data: Record<string, unknown> = workData();
      delete data[key];
      await assertFails(setDoc(workRef(ctx), data));
    }
  });
});

describe("Firestore: sketches, field by field", () => {
  const ctx = () => as(ME);

  it("threshold is a whole number 0..255, lineWeight 0.5..10, removeFills a boolean", async () => {
    for (const bad of [-1, 256, 1.5, "140"]) await assertFails(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { threshold: bad })));
    for (const bad of [0.4, 10.1, "2"]) await assertFails(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { lineWeight: bad })));
    await assertSucceeds(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { threshold: 0, lineWeight: 0.5 })));
    await assertSucceeds(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { threshold: 255, lineWeight: 10 })));
  });

  it("fileName is a string of at most 255 characters; createdAt a timestamp", async () => {
    await assertFails(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { fileName: "x".repeat(256) })));
    await assertFails(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { fileName: 7 })));
    await assertFails(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { createdAt: "yesterday" })));
    await assertSucceeds(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { fileName: "x".repeat(255) })));
  });

  it("paths: the original is png, jpg or webp in its own folder; the stencil is its own stencil.png", async () => {
    for (const ext of ["png", "jpg", "webp"]) {
      await assertSucceeds(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { originalPath: `users/${ME}/sketches/${SKETCH}/original.${ext}` })));
    }
    for (const bad of [
      `users/${ME}/sketches/${SKETCH}/original.gif`,
      `users/${ME}/sketches/${SKETCH}/original.png.exe`,
      `users/${ME}/sketches/other/original.png`,
      `users/${ME}/sketches/${SKETCH}/ink.bin`,
    ]) {
      await assertFails(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { originalPath: bad })));
    }
    await assertFails(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { stencilPath: `users/${ME}/sketches/other/stencil.png` })));
    await assertFails(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { stencilPath: 5 })));
  });

  it("missing fields are refused", async () => {
    for (const key of ["originalPath", "stencilPath", "threshold", "lineWeight", "removeFills", "fileName", "createdAt"]) {
      const data: Record<string, unknown> = sketchData();
      delete data[key];
      await assertFails(setDoc(sketchRef(ctx()), data));
    }
  });

  it("createdAt cannot change on update; others and signed-out visitors cannot update or delete", async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), "users", ME, "sketches", SKETCH), sketchData()));
    await assertSucceeds(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { threshold: 100 })));
    await assertFails(setDoc(sketchRef(ctx()), sketchData(ME, SKETCH, { createdAt: Timestamp.fromMillis(2_000_000_000_000) })));
    await assertFails(setDoc(sketchRef(as(OTHER), ME), sketchData(ME, SKETCH, { threshold: 1 })));
    await assertFails(deleteDoc(sketchRef(as(OTHER), ME)));
    await assertFails(deleteDoc(sketchRef(anon(), ME)));
    await assertFails(getDocs(collection(as(OTHER).firestore(), "users", ME, "sketches")));
  });

  it("a sketch id must be a plain id", async () => {
    await assertFails(setDoc(doc(ctx().firestore(), "users", ME, "sketches", "a b"), sketchData(ME, "a b")));
  });
});

describe("Storage: each file name has its own type and size", () => {
  const sketchDir = `users/${ME}/sketches/${SKETCH}`;
  const workDir = `users/${ME}/works/${WORK}`;
  const put = (path: string, size: number, contentType: string, ctx = as(ME)) => uploadBytes(storageRef(ctx, path), bytes(size), { contentType });
  const MB = 1024 * 1024;

  it("sketch files: original.png/jpg/webp with their own type, stencil.png as png", async () => {
    await assertSucceeds(put(`${sketchDir}/original.png`, 10, "image/png"));
    await assertSucceeds(put(`${sketchDir}/original.jpg`, 10, "image/jpeg"));
    await assertSucceeds(put(`${sketchDir}/original.webp`, 10, "image/webp"));
    await assertSucceeds(put(`${sketchDir}/stencil.png`, 10, "image/png"));
    await assertSucceeds(put(`${sketchDir}/stencil.png`, 10 * MB - 1, "image/png")); // overwrite, just under the limit
  });

  it("sketch files: the type must fit the name", async () => {
    await assertFails(put(`${sketchDir}/original.png`, 10, "image/jpeg"));
    await assertFails(put(`${sketchDir}/original.jpg`, 10, "image/png"));
    await assertFails(put(`${sketchDir}/original.webp`, 10, "image/png"));
    await assertFails(put(`${sketchDir}/stencil.png`, 10, "image/webp"));
    await assertFails(put(`${sketchDir}/stencil.png`, 10, "image/svg+xml"));
    await assertFails(put(`${sketchDir}/original.png`, 10, "application/octet-stream"));
  });

  it("sketch files: no other names, 10 MB at most", async () => {
    for (const name of ["original.gif", "original.svg", "original.png.exe", "stencil.jpg", "ink.bin", "trauma.bin", "preview.webp", "index.html", ".htaccess"]) {
      await assertFails(put(`${sketchDir}/${name}`, 10, "image/png"));
    }
    await assertFails(put(`${sketchDir}/original.png/extra.png`, 10, "image/png"));
    await assertFails(put(`${sketchDir}/stencil.png`, 10 * MB, "image/png"));
  });

  it("work files: ink.bin and trauma.bin are octet-stream under 25 MB, preview.webp is webp or png under 2 MB", async () => {
    await assertSucceeds(put(`${workDir}/ink.bin`, 10, "application/octet-stream"));
    await assertSucceeds(put(`${workDir}/trauma.bin`, 10, "application/octet-stream"));
    await assertSucceeds(put(`${workDir}/preview.webp`, 10, "image/webp"));
    await assertSucceeds(put(`${workDir}/preview.webp`, 10, "image/png")); // the fallback when WebP cannot be encoded
    await assertSucceeds(put(`${workDir}/ink.bin`, 25 * MB - 1, "application/octet-stream"));
    await assertFails(put(`${workDir}/ink.bin`, 25 * MB, "application/octet-stream"));
    await assertFails(put(`${workDir}/trauma.bin`, 25 * MB, "application/octet-stream"));
    await assertFails(put(`${workDir}/preview.webp`, 2 * MB, "image/webp"));
  });

  it("work files: the type must fit the name", async () => {
    await assertFails(put(`${workDir}/ink.bin`, 10, "image/png"));
    await assertFails(put(`${workDir}/trauma.bin`, 10, "text/html"));
    await assertFails(put(`${workDir}/preview.webp`, 10, "application/octet-stream"));
    await assertFails(put(`${workDir}/preview.webp`, 10, "text/html"));
    await assertFails(put(`${workDir}/preview.webp`, 10, "image/jpeg"));
  });

  it("work files: no other names", async () => {
    for (const name of ["original.png", "stencil.png", "preview.png", "ink.bin.exe", "ink.BIN", "index.html", "x"]) {
      await assertFails(put(`${workDir}/${name}`, 10, name.endsWith(".png") ? "image/png" : "application/octet-stream"));
    }
  });

  it("only the owner reads or writes; deleting is the owner's too; signed-out visitors get nothing", async () => {
    await assertSucceeds(put(`${workDir}/ink.bin`, 10, "application/octet-stream"));
    await assertSucceeds(put(`${sketchDir}/original.png`, 10, "image/png"));
    await assertFails(put(`${workDir}/ink.bin`, 10, "application/octet-stream", as(OTHER)));
    await assertFails(put(`${sketchDir}/original.png`, 10, "image/png", as(OTHER)));
    await assertFails(put(`${workDir}/ink.bin`, 10, "application/octet-stream", anon()));
    await assertFails(getBytes(storageRef(as(OTHER), `${sketchDir}/original.png`)));
    await assertFails(getBytes(storageRef(anon(), `${workDir}/ink.bin`)));
    await assertFails(deleteObject(storageRef(as(OTHER), `${workDir}/ink.bin`)));
    await assertFails(deleteObject(storageRef(anon(), `${workDir}/ink.bin`)));
    await assertSucceeds(deleteObject(storageRef(as(ME), `${workDir}/ink.bin`)));
    await assertSucceeds(deleteObject(storageRef(as(ME), `${sketchDir}/original.png`)));
  });
});
