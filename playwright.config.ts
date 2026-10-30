import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * End-to-end tests run against the Firebase emulators and a Vite dev server, in software-rendered Chromium so they
 * need no GPU (CI has none). `npm run test:e2e` starts demo emulators and runs everything; `npm run e2e` runs against
 * whatever emulators you already have (the project from .firebaserc, as `npm run dev` uses).
 */
const firebaserc = JSON.parse(readFileSync(".firebaserc", "utf8")) as { projects: Record<string, string> };
const PROJECT = process.env.E2E_PROJECT ?? firebaserc.projects.dev!;
process.env.E2E_PROJECT = PROJECT; // the helpers in e2e/support.ts read it
const isCi = !!process.env.CI;

// With a demo project there is no .env.local to take the Firebase config from.
const demoConfig: Record<string, string> = PROJECT.startsWith("demo-")
  ? {
      VITE_FIREBASE_API_KEY: "demo-key",
      VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
      VITE_FIREBASE_PROJECT_ID: PROJECT,
      VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT}.firebasestorage.app`,
      VITE_FIREBASE_MESSAGING_SENDER_ID: "0",
      VITE_FIREBASE_APP_ID: "1:0:web:0",
      VITE_FIREBASE_MEASUREMENT_ID: "",
    }
  : {};
const appEnv = { VITE_USE_EMULATORS: "true", ...demoConfig };

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: isCi ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    // Recording a trace for every test raced with Playwright's cleanup and failed passing tests with ENOENT; only a retry records one.
    trace: "on-first-retry",
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [
    { name: "app", testIgnore: "**/preview.spec.ts", use: { baseURL: "http://localhost:5173" } },
    // The same app built with VITE_DISABLE_WRITES=true, as the preview channel serves it.
    { name: "preview", testMatch: "**/preview.spec.ts", use: { baseURL: "http://localhost:5174" } },
  ],
  webServer: [
    { command: "npm run dev -- --port 5173 --strictPort", url: "http://localhost:5173", reuseExistingServer: !isCi, env: appEnv },
    { command: "npm run dev -- --port 5174 --strictPort", url: "http://localhost:5174", reuseExistingServer: !isCi, env: { ...appEnv, VITE_DISABLE_WRITES: "true" } },
  ],
});
