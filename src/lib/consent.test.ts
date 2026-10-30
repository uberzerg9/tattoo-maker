import { afterEach, describe, expect, it, vi } from "vitest";

/** A stand-in for window.localStorage; `broken` makes every access throw like a blocked-storage browser. */
function stubStorage(broken = false) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => {
      if (broken) throw new Error("blocked");
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error("blocked");
      data.set(k, v);
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  return data;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("consent", () => {
  it("is unanswered at first, then remembers the answer and tells listeners", async () => {
    const data = stubStorage();
    const { currentConsent, setConsent, subscribeConsent } = await import("./consent");
    expect(currentConsent()).toBeNull();
    const listener = vi.fn();
    const stop = subscribeConsent(listener);
    setConsent("granted");
    expect(currentConsent()).toBe("granted");
    expect(data.get("tt.analyticsConsent")).toBe("granted");
    setConsent("denied");
    expect(currentConsent()).toBe("denied");
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    setConsent("granted");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores a stored value that is not an answer", async () => {
    stubStorage().set("tt.analyticsConsent", "maybe");
    const { currentConsent } = await import("./consent");
    expect(currentConsent()).toBeNull();
  });

  it("still applies the answer for this page when storage is blocked", async () => {
    stubStorage(true);
    const { currentConsent, setConsent } = await import("./consent");
    expect(currentConsent()).toBeNull();
    setConsent("denied");
    expect(currentConsent()).toBe("denied");
  });
});
