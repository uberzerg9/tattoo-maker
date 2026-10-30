import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** The Firebase project the emulators and the app use (set by playwright.config.ts). */
export const PROJECT = process.env.E2E_PROJECT!;
const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = "http://127.0.0.1:8080";
const STORAGE = "http://127.0.0.1:9199";
const ADMIN = { Authorization: "Bearer owner" };
const JSON_HEADERS = { ...ADMIN, "content-type": "application/json" };

const RUN = Date.now().toString(36);
let counter = 0;

export interface TestUser {
  username: string;
  email: string;
  password: string;
}

/** A fresh account name per call; all end in @example.com, so scripts/cleanup-test-data.ts can find them. */
export function newUser(tag: string): TestUser {
  counter += 1;
  return { username: `e2e_${tag}_${RUN}${counter}`.slice(0, 20), email: `e2e.${tag}.${RUN}${counter}@example.com`, password: "Abcdef1!" };
}

/** Keeps the cookie banner out of the way of tests that are not about it. */
export async function declineCookies(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("tt.analyticsConsent", "denied"));
}

/** Signs up through the form, as a person would. */
export async function signUp(page: Page, user: TestUser): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("E2E Tester");
  await page.getByLabel("Username", { exact: true }).fill(user.username);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Apprentice" }).click();
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
}

export async function logIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "LOG IN", exact: true }).click();
}

/** Drags across the middle of the sheet, slowly enough to count as a stroke. */
export async function drawStroke(page: Page): Promise<void> {
  const box = (await page.locator(".sheet").boundingBox())!;
  const x = box.x + box.width / 2;
  const y0 = box.y + box.height * 0.3;
  await page.mouse.move(x, y0);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(x, y0 + i * 6);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.mouse.move(5, 5);
}

export async function selectLiner(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Main outline/ }).click();
  await expect(page.getByRole("button", { name: /Main outline/ })).toHaveAttribute("aria-pressed", "true");
}

// ---- emulator REST (as the emulator's own owner) ----

async function authUsers(): Promise<{ localId: string; email?: string }[]> {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ returnUserInfo: true }) });
  return ((await res.json()) as { userInfo?: { localId: string; email?: string }[] }).userInfo ?? [];
}

export async function uidOf(email: string): Promise<string | undefined> {
  return (await authUsers()).find((u) => u.email === email)?.localId;
}

/** Number of documents in a collection, e.g. `users/<uid>/sessions`. */
export async function countDocs(path: string): Promise<number> {
  const res = await fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { headers: ADMIN });
  return ((await res.json()) as { documents?: unknown[] }).documents?.length ?? 0;
}

export async function getDoc(path: string): Promise<Record<string, { stringValue?: string }> | null> {
  const res = await fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { headers: ADMIN });
  if (!res.ok) return null;
  return ((await res.json()) as { fields: Record<string, { stringValue?: string }> }).fields;
}

export async function storageFiles(prefix: string): Promise<string[]> {
  const res = await fetch(`${STORAGE}/v0/b/${PROJECT}.firebasestorage.app/o?prefix=${encodeURIComponent(prefix)}`, { headers: ADMIN });
  return ((await res.json()) as { items?: { name: string }[] }).items?.map((i) => i.name) ?? [];
}

/** An account made without the UI: the sign-in and the profile the sign-up would write. */
export async function seedUser(user: TestUser): Promise<string> {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password }) });
  const uid = ((await res.json()) as { localId: string }).localId;
  const str = (stringValue: string) => ({ stringValue });
  const profile = {
    name: str("Seeded Tester"), username: str(user.username), level: str("apprentice"), language: str("en"),
    createdAt: { timestampValue: new Date().toISOString() },
    settings: { mapValue: { fields: { skinTone: str("t2"), machineHz: { integerValue: "85" }, units: str("cm") } } },
  };
  const base = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
  await fetch(`${base}/users/${uid}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ fields: profile }) });
  await fetch(`${base}/usernames/${user.username}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ fields: { uid: str(uid) } }) });
  return uid;
}

/** Removes an account the way the deleteAccount function would: sign-in, profile tree, username, files. */
export async function removeUser(user: TestUser): Promise<void> {
  const uid = await uidOf(user.email);
  const base = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
  if (uid) {
    for (const sub of ["works", "sketches", "sessions"]) {
      const res = await fetch(`${base}/users/${uid}/${sub}`, { headers: ADMIN });
      for (const d of ((await res.json()) as { documents?: { name: string }[] }).documents ?? []) await fetch(`${FIRESTORE}/v1/${d.name}`, { method: "DELETE", headers: ADMIN });
    }
    await fetch(`${base}/users/${uid}`, { method: "DELETE", headers: ADMIN });
    for (const name of await storageFiles(`users/${uid}/`)) await fetch(`${STORAGE}/v0/b/${PROJECT}.firebasestorage.app/o/${encodeURIComponent(name)}`, { method: "DELETE", headers: ADMIN });
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ localId: uid }) });
  }
  await fetch(`${base}/usernames/${user.username}`, { method: "DELETE", headers: ADMIN });
}
