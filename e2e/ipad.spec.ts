import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Pointers } from "./input.ts";
import { declineCookies, drawStroke, newUser, removeUser, selectLiner, signUp } from "./support.ts";

/** Touch, pencil, pinch, panel dragging and iPad-sized layouts. Chromium with touch emulation stands in for Safari. */
test.use({ hasTouch: true });

async function inWorkspace(page: Page, tag: string) {
  const user = newUser(tag);
  await declineCookies(page);
  await signUp(page, user);
  await expect(page.locator(".topbar__avatar")).toBeVisible({ timeout: 30_000 });
  // Out of the way: the tour would sit over the stage.
  const tour = page.getByTestId("onboarding");
  if (await tour.isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  return user;
}

const readout = (page: Page) => page.locator(".toolbar__readout--zoom");
const zoomOf = async (page: Page) => parseInt((await readout(page).innerText()).replace(/\D/g, ""), 10) / 100;
const passes = (page: Page) => page.locator(".feedback__num").first();
const sheetBox = async (page: Page) => (await page.locator(".sheet").boundingBox())!;
const center = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test.describe("zoom range", () => {
  test("goes from 50% to 400% and the toolbar buttons stop there", async ({ page }) => {
    const user = await inWorkspace(page, "zoom");
    try {
      const zoomIn = page.getByRole("button", { name: "Zoom in" });
      const zoomOut = page.getByRole("button", { name: "Zoom out" });
      for (let i = 0; i < 12; i++) await zoomIn.click(); // 100% + 12 × 25% = 400%
      await expect(readout(page)).toHaveText("400%");
      await expect(zoomIn).toBeDisabled();
      for (let i = 0; i < 14; i++) await zoomOut.click(); // 400% - 14 × 25% = 50%
      await expect(readout(page)).toHaveText("50%");
      await expect(zoomOut).toBeDisabled();
      // The wheel (Ctrl + scroll) respects the same ends.
      await page.mouse.move(700, 450);
      await page.keyboard.down("Control");
      for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -60);
      await page.keyboard.up("Control");
      await expect(readout(page)).toHaveText("400%");
    } finally {
      await removeUser(user);
    }
  });
});

test.describe("touch and pencil", () => {
  test("one finger pans the sheet and never draws, even with the needle selected", async ({ page }) => {
    const user = await inWorkspace(page, "pan");
    try {
      await selectLiner(page);
      const pointers = await Pointers.attach(page);
      const before = await sheetBox(page);
      const c = center(before);
      await pointers.touchDown(1, c.x, c.y);
      for (let i = 1; i <= 10; i++) await pointers.touchMove({ 1: { x: c.x + i * 10, y: c.y + i * 6 } });
      await pointers.touchUp(1);
      const after = await sheetBox(page);
      expect(after.x - before.x).toBeGreaterThan(60);
      expect(after.y - before.y).toBeGreaterThan(30);
      await expect(passes(page)).toHaveText("0");
    } finally {
      await removeUser(user);
    }
  });

  test("two fingers zoom about the midpoint between them, and the zoom has a limit", async ({ page }) => {
    const user = await inWorkspace(page, "pinch");
    try {
      const pointers = await Pointers.attach(page);
      const before = await sheetBox(page);
      const mid = { x: before.x + before.width * 0.4, y: before.y + before.height * 0.6 }; // a point on the sheet, not its centre
      const fracBefore = { x: (mid.x - before.x) / before.width, y: (mid.y - before.y) / before.height };
      await pointers.touchDown(1, mid.x - 60, mid.y);
      await pointers.touchDown(2, mid.x + 60, mid.y);
      for (let i = 1; i <= 12; i++) await pointers.touchMove({ 1: { x: mid.x - 60 - i * 12, y: mid.y }, 2: { x: mid.x + 60 + i * 12, y: mid.y } });
      const during = await zoomOf(page);
      expect(during).toBeGreaterThan(1.8); // fingers 5× further apart than at the start, until the limit
      const after = await sheetBox(page);
      const fracAfter = { x: (mid.x - after.x) / after.width, y: (mid.y - after.y) / after.height };
      // The sheet point that was between the fingers is still between them.
      expect(Math.abs(fracAfter.x - fracBefore.x)).toBeLessThan(0.01);
      expect(Math.abs(fracAfter.y - fracBefore.y)).toBeLessThan(0.01);
      await pointers.touchUp(1);
      await pointers.touchUp(2);
      await expect(passes(page)).toHaveText("0");
      expect(await zoomOf(page)).toBeLessThanOrEqual(4);
    } finally {
      await removeUser(user);
    }
  });

  test("a two-finger twist rotates the sheet, and lands on exactly 0° near upright", async ({ page }) => {
    const user = await inWorkspace(page, "twist");
    try {
      const pointers = await Pointers.attach(page);
      const c = center(await sheetBox(page));
      const at = (deg: number) => ({ a: { x: c.x - 100 * Math.cos((deg * Math.PI) / 180), y: c.y - 100 * Math.sin((deg * Math.PI) / 180) }, b: { x: c.x + 100 * Math.cos((deg * Math.PI) / 180), y: c.y + 100 * Math.sin((deg * Math.PI) / 180) } });
      const rotation = async () => parseFloat((await page.locator(".toolbar__readout--rotation").innerText()).replace(",", ".").replace(/[^\d.-]/g, ""));
      const start = at(0);
      await pointers.touchDown(1, start.a.x, start.a.y);
      await pointers.touchDown(2, start.b.x, start.b.y);
      for (const deg of [10, 20, 30, 40, 45]) {
        const p = at(deg);
        await pointers.touchMove({ 1: p.a, 2: p.b });
      }
      await expect.poll(async () => Math.abs((await rotation()) - 45)).toBeLessThan(1.5);
      // Twist back to 2° off upright: it snaps to 0.
      for (const deg of [30, 15, 5, 2]) {
        const p = at(deg);
        await pointers.touchMove({ 1: p.a, 2: p.b });
      }
      await expect.poll(rotation).toBe(0);
      await pointers.touchUp(1);
      await pointers.touchUp(2);
    } finally {
      await removeUser(user);
    }
  });

  test("the pencil always draws, even with the hand tool selected; a mouse follows the tool", async ({ page }) => {
    const user = await inWorkspace(page, "pen");
    try {
      await page.getByRole("button", { name: "Tool: move skin" }).click();
      const pointers = await Pointers.attach(page);
      const box = await sheetBox(page);
      const x = box.x + box.width / 2;
      const y = box.y + box.height * 0.3;
      await pointers.penDown(x, y);
      for (let i = 1; i <= 20; i++) {
        await pointers.penMove(x, y + i * 6);
        await page.waitForTimeout(25);
      }
      await pointers.penUp(x, y + 120);
      await expect(passes(page)).toHaveText("1");
      // With the hand tool a mouse drag moves the sheet instead of drawing.
      const before = await sheetBox(page);
      await page.mouse.move(box.x + 50, box.y + 50);
      await page.mouse.down();
      await page.mouse.move(box.x + 120, box.y + 90, { steps: 6 });
      await page.mouse.up();
      expect((await sheetBox(page)).x).toBeGreaterThan(before.x + 40);
      await expect(passes(page)).toHaveText("1");
    } finally {
      await removeUser(user);
    }
  });

  test("a second finger landing in the middle of a stroke drops that stroke, ink included", async ({ page }) => {
    const user = await inWorkspace(page, "cancel");
    try {
      await selectLiner(page);
      const pointers = await Pointers.attach(page);
      const box = await sheetBox(page);
      const x = box.x + box.width / 2;
      const y = box.y + box.height * 0.3;
      await pointers.penDown(x, y);
      for (let i = 1; i <= 30; i++) {
        await pointers.penMove(x, y + i * 4);
        await page.waitForTimeout(25);
      }
      // Two fingers land: a pinch begins and the pencil stroke is thrown away.
      await pointers.touchDown(1, x - 150, y + 200);
      await pointers.touchDown(2, x + 150, y + 200);
      await pointers.penUp(x, y + 120);
      await pointers.touchUp(1);
      await pointers.touchUp(2);
      await expect(passes(page)).toHaveText("0");
      await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled(); // nothing left to take back
    } finally {
      await removeUser(user);
    }
  });

  test("a palm resting beside the pencil does not stop the stroke", async ({ page }) => {
    const user = await inWorkspace(page, "palm");
    try {
      await selectLiner(page);
      const pointers = await Pointers.attach(page);
      const box = await sheetBox(page);
      const x = box.x + box.width / 2;
      const y = box.y + box.height * 0.3;
      await pointers.penDown(x, y);
      await pointers.touchDown(1, x + 250, y + 150); // one touch only: a palm, not a pinch
      for (let i = 1; i <= 20; i++) {
        await pointers.penMove(x, y + i * 5);
        await page.waitForTimeout(25);
      }
      await pointers.penUp(x, y + 100);
      await pointers.touchUp(1);
      await expect(passes(page)).toHaveText("1");
    } finally {
      await removeUser(user);
    }
  });
});

test.describe("floating panels with a finger", () => {
  test("a panel can be dragged by its header and resized by its corner", async ({ page }) => {
    const user = await inWorkspace(page, "panel");
    try {
      const pointers = await Pointers.attach(page);
      const panel = page.locator(".panel--skin");
      const header = panel.locator(".panel__header");
      const before = (await panel.boundingBox())!;
      const h = (await header.boundingBox())!;
      const from = { x: h.x + 30, y: h.y + h.height / 2 };
      await pointers.touchDown(1, from.x, from.y);
      for (let i = 1; i <= 8; i++) await pointers.touchMove({ 1: { x: from.x - i * 20, y: from.y - i * 12 } });
      await pointers.touchUp(1);
      const moved = (await panel.boundingBox())!;
      expect(before.x - moved.x).toBeGreaterThan(100);
      expect(before.y - moved.y).toBeGreaterThan(50);

      const body = panel.locator(".panel__body");
      const bodyBefore = (await body.boundingBox())!;
      const grip = (await panel.locator(".panel__resize").boundingBox())!;
      const g = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
      await pointers.touchDown(1, g.x, g.y);
      for (let i = 1; i <= 6; i++) await pointers.touchMove({ 1: { x: g.x + i * 10, y: g.y + i * 15 } });
      await pointers.touchUp(1);
      const bodyAfter = (await body.boundingBox())!;
      expect(bodyAfter.width - bodyBefore.width).toBeGreaterThan(40);
      expect(bodyAfter.height - bodyBefore.height).toBeGreaterThan(60);
    } finally {
      await removeUser(user);
    }
  });
});

test.describe("iPad layouts", () => {
  const SIZES = [
    { name: "iPad portrait", width: 820, height: 1180 },
    { name: "iPad landscape", width: 1180, height: 820 },
    { name: "iPad mini portrait", width: 744, height: 1133 },
    { name: "iPad landscape with Safari's bars (short)", width: 1180, height: 650 },
  ];

  for (const size of SIZES) {
    test(`${size.name}: the whole bottom toolbar is on screen and wraps instead of overflowing`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const user = await inWorkspace(page, "ipad");
      try {
        const { workspace, toolbar, buttons, viewport } = await page.evaluate(() => {
          const r = (e: Element) => e.getBoundingClientRect();
          const tb = document.querySelector(".toolbar")!;
          return {
            workspace: r(document.querySelector(".workspace")!).height,
            toolbar: { left: r(tb).left, right: r(tb).right, top: r(tb).top, bottom: r(tb).bottom },
            buttons: [...tb.querySelectorAll("button")].map((b) => ({ right: r(b).right, bottom: r(b).bottom, left: r(b).left, top: r(b).top })),
            viewport: { width: innerWidth, height: innerHeight },
          };
        });
        expect(workspace).toBe(viewport.height); // the dynamic viewport height, not a fixed minimum
        expect(toolbar.left).toBeGreaterThanOrEqual(0);
        expect(toolbar.right).toBeLessThanOrEqual(viewport.width);
        expect(toolbar.bottom).toBeLessThanOrEqual(viewport.height);
        for (const b of buttons) {
          expect(b.right).toBeLessThanOrEqual(viewport.width);
          expect(b.left).toBeGreaterThanOrEqual(0);
          expect(b.bottom).toBeLessThanOrEqual(viewport.height);
        }
        // Every control is actually reachable: the last one can be tapped.
        await page.locator(".toolbar button").last().tap();
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      } finally {
        await removeUser(user);
      }
    });
  }

  test("the viewport asks for the whole screen and blocks Safari's page zoom", async ({ page }) => {
    await page.goto("/login");
    const content = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(content).toContain("viewport-fit=cover");
    expect(content).toContain("maximum-scale=1");
  });

  test("Safari's own pinch (gesture events) is cancelled on the stage", async ({ page }) => {
    const user = await inWorkspace(page, "gesture");
    try {
      const prevented = await page.evaluate(() => {
        const results: boolean[] = [];
        for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
          const e = new Event(type, { cancelable: true, bubbles: true });
          document.querySelector(".stage")!.dispatchEvent(e);
          results.push(e.defaultPrevented);
        }
        return results;
      });
      expect(prevented).toEqual([true, true, true]);
    } finally {
      await removeUser(user);
    }
  });

  test("a stroke by mouse still works as before (no regression)", async ({ page }) => {
    const user = await inWorkspace(page, "mouse");
    try {
      await selectLiner(page);
      await drawStroke(page);
      await expect(passes(page)).toHaveText("1");
    } finally {
      await removeUser(user);
    }
  });
});
