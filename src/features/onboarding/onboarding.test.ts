import { afterEach, describe, expect, it, vi } from "vitest";
import { placeCard } from "./placeCard";

const card = { width: 320, height: 180 };
const viewport = { width: 1440, height: 900 };
const box = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height });

describe("placeCard", () => {
  it("goes to the right of a panel on the left", () => {
    expect(placeCard(box(24, 86, 280, 320), card, viewport)).toEqual({ left: 24 + 280 + 16, top: 86 });
  });

  it("goes to the left of a panel on the right", () => {
    const p = placeCard(box(1136, 512, 280, 300), card, viewport);
    expect(p.left).toBe(1136 - 16 - 320);
    expect(p.top).toBe(512);
  });

  it("stays inside the screen vertically", () => {
    expect(placeCard(box(24, 800, 280, 300), card, viewport).top).toBe(900 - 180 - 12);
    expect(placeCard(box(24, -50, 280, 300), card, viewport).top).toBe(12);
  });

  it("goes to the bottom centre for a target that spans the middle, or no target", () => {
    const sheet = box(300, 200, 840, 520);
    const centre = placeCard(sheet, card, { width: 1180, height: 720 });
    expect(centre.left).toBe((1180 - 320) / 2);
    expect(centre.top).toBe(720 - 180 - 140);
    expect(placeCard(null, card, { width: 1180, height: 720 })).toEqual(centre);
  });

  it("never leaves the screen on a small one", () => {
    const p = placeCard(null, card, { width: 330, height: 300 });
    expect(p.left).toBeGreaterThanOrEqual(12);
    expect(p.top).toBeGreaterThanOrEqual(12);
  });
});

describe("onboarding seen flag", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function stub(broken = false) {
    const data = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => {
          if (broken) throw new Error("blocked");
          return data.get(k) ?? null;
        },
        setItem: (k: string, v: string) => {
          if (broken) throw new Error("blocked");
          data.set(k, v);
        },
      },
    });
  }

  it("is unseen until marked, and kept per person", async () => {
    stub();
    const { hasSeenOnboarding, markOnboardingSeen } = await import("./onboardingSeen");
    expect(hasSeenOnboarding("alice")).toBe(false);
    markOnboardingSeen("alice");
    expect(hasSeenOnboarding("alice")).toBe(true);
    expect(hasSeenOnboarding("bob")).toBe(false);
  });

  it("counts as seen when storage is blocked, so the tour cannot nag on every visit", async () => {
    stub(true);
    const { hasSeenOnboarding } = await import("./onboardingSeen");
    expect(hasSeenOnboarding("alice")).toBe(true);
  });
});
