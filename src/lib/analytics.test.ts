import type { Analytics } from "firebase/analytics";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalytics } from "./analytics";
import type { AnalyticsDeps, AnalyticsSdk } from "./analytics";
import type { ConsentChoice } from "./consent";

const instance = { name: "analytics" } as unknown as Analytics;

function setup(over: Partial<AnalyticsDeps> = {}, supported = true) {
  let consent: ConsentChoice | null = null;
  const sdk: AnalyticsSdk = {
    isSupported: vi.fn(async () => supported),
    start: vi.fn(() => instance),
    logEvent: vi.fn(),
    setCollectionEnabled: vi.fn(),
  };
  const loadSdk = vi.fn(async () => sdk);
  const clearCookies = vi.fn();
  const analytics = createAnalytics({ isDev: false, measurementId: "G-TEST", consent: () => consent, loadSdk, clearCookies, ...over });
  return { analytics, sdk, loadSdk, clearCookies, setConsent: (c: ConsentChoice | null) => (consent = c) };
}

beforeEach(() => {
  vi.stubGlobal("window", {});
});

describe("analytics", () => {
  it("loads nothing before the person has answered", async () => {
    const { analytics, loadSdk } = setup();
    await analytics.sync();
    analytics.log("sign_up", { method: "email" });
    expect(loadSdk).not.toHaveBeenCalled();
    expect(analytics.active).toBe(false);
  });

  it("loads nothing after a refusal, and removes old cookies", async () => {
    const { analytics, loadSdk, clearCookies, setConsent } = setup();
    setConsent("denied");
    await analytics.sync();
    expect(loadSdk).not.toHaveBeenCalled();
    expect(clearCookies).toHaveBeenCalled();
  });

  it("never runs in dev, even with consent", async () => {
    const { analytics, loadSdk, setConsent } = setup({ isDev: true });
    setConsent("granted");
    await analytics.sync();
    analytics.log("work_saved", { passes: 1 });
    expect(loadSdk).not.toHaveBeenCalled();
    expect(analytics.active).toBe(false);
  });

  it("does nothing without a measurement id", async () => {
    const { analytics, loadSdk, setConsent } = setup({ measurementId: undefined });
    setConsent("granted");
    await analytics.sync();
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it("does not start when the browser does not support it", async () => {
    const { analytics, sdk, setConsent } = setup({}, false);
    setConsent("granted");
    await analytics.sync();
    analytics.log("work_saved", { passes: 1 });
    expect(sdk.start).not.toHaveBeenCalled();
    expect(sdk.logEvent).not.toHaveBeenCalled();
    expect(analytics.active).toBe(false);
  });

  it("starts once on consent and sends events with their parameters", async () => {
    const { analytics, sdk, setConsent } = setup();
    setConsent("granted");
    await analytics.sync();
    await analytics.sync();
    expect(sdk.start).toHaveBeenCalledTimes(1);
    expect(analytics.active).toBe(true);
    analytics.log("session_end", { duration_s: 90, deviation_mm: 0.4, trauma_level: "low" });
    expect(sdk.logEvent).toHaveBeenCalledWith(instance, "session_end", { duration_s: 90, deviation_mm: 0.4, trauma_level: "low" });
  });

  it("stops sending and clears cookies when consent is withdrawn, and resumes if given again", async () => {
    const { analytics, sdk, clearCookies, setConsent } = setup();
    setConsent("granted");
    await analytics.sync();
    setConsent("denied");
    await analytics.sync();
    analytics.log("work_saved", { passes: 2 });
    expect(sdk.logEvent).not.toHaveBeenCalled();
    expect(sdk.setCollectionEnabled).toHaveBeenLastCalledWith(instance, false);
    expect(clearCookies).toHaveBeenCalled();
    expect(analytics.active).toBe(false);

    setConsent("granted");
    await analytics.sync();
    expect(sdk.start).toHaveBeenCalledTimes(1); // the same instance is switched back on
    expect(sdk.setCollectionEnabled).toHaveBeenLastCalledWith(instance, true);
    analytics.log("work_saved", { passes: 3 });
    expect(sdk.logEvent).toHaveBeenCalledTimes(1);
  });

  it("an event is dropped the moment consent goes, before any sync runs", async () => {
    const { analytics, sdk, setConsent } = setup();
    setConsent("granted");
    await analytics.sync();
    setConsent("denied");
    analytics.log("first_stroke", { cartridge: "rl-7" });
    expect(sdk.logEvent).not.toHaveBeenCalled();
  });

  it("survives the SDK failing to load (blocked by an extension)", async () => {
    const { analytics, setConsent } = setup({ loadSdk: vi.fn().mockRejectedValue(new Error("blocked")) });
    setConsent("granted");
    await expect(analytics.sync()).resolves.toBeUndefined();
    expect(analytics.active).toBe(false);
  });
});
