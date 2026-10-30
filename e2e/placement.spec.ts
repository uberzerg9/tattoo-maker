import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { declineCookies, drawStroke, newUser, removeUser, selectLiner, signUp } from "./support.ts";

async function ready(page: Page, tag: string) {
  const user = newUser(tag);
  await declineCookies(page);
  await signUp(page, user);
  await expect(page.locator(".topbar__avatar")).toBeVisible({ timeout: 30_000 });
  const tour = page.getByTestId("onboarding");
  if (await tour.isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  return user;
}

/** Uploads a simple line drawing and transfers it to the skin: the stencil is then being placed. */
async function transfer(page: Page) {
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 800;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 600, 800);
    g.strokeStyle = "#222";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(300, 60);
    g.lineTo(300, 740);
    g.stroke();
    return c.toDataURL("image/png").split(",")[1]!;
  });
  await page.getByTestId("panel-sketch-file").setInputFiles({ name: "line.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(page.getByRole("dialog")).toBeVisible();
  const go = page.getByRole("button", { name: "TRANSFER TO SKIN" });
  await expect(go).toBeEnabled({ timeout: 150_000 }); // the first dialog of a run loads OpenCV cold
  await go.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

const bar = (page: Page) => page.getByTestId("placement-bar");
const passes = (page: Page) => page.locator(".feedback__num").first();

test.describe("stencil placement", () => {
  test.setTimeout(240_000);
  test("after the transfer the stencil is placed, not drawn on, until it is applied with Enter", async ({ page }) => {
    const user = await ready(page, "enter");
    try {
      await selectLiner(page);
      await transfer(page);
      await expect(bar(page)).toBeVisible();
      await expect(page.locator(".stencil-handles")).toBeVisible();
      await expect(bar(page).getByRole("button", { name: "APPLY STENCIL" })).toBeVisible();
      await expect(bar(page).getByRole("button", { name: "CANCEL" })).toBeVisible();

      // Drawing is off, and the first stroke does not lock anything.
      await drawStroke(page);
      await expect(passes(page)).toHaveText("0");
      await expect(bar(page)).toBeVisible();
      await expect(page.locator(".stencil-handles")).toBeVisible();

      await page.keyboard.press("Enter");
      await expect(bar(page)).toHaveCount(0);
      await expect(page.locator(".stencil-handles")).toHaveCount(0);
      await drawStroke(page);
      await expect(passes(page)).toHaveText("1");
    } finally {
      await removeUser(user);
    }
  });

  test("Space applies too, but not while a panel button has focus", async ({ page }) => {
    const user = await ready(page, "space");
    try {
      await transfer(page);
      // Space on a focused panel button presses that button and leaves the stencil alone.
      const cart = page.getByRole("button", { name: /Main outline/ });
      await cart.focus();
      await page.keyboard.press("Space");
      await expect(cart).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Enter");
      await expect(bar(page)).toBeVisible();
      // Typing in an input is not a confirmation either.
      await page.locator(".panel--machine input[type=range]").focus();
      await page.keyboard.press("Space");
      await expect(bar(page)).toBeVisible();
      // From the sheet (nothing focused) Space applies.
      await page.locator(".stage").click({ position: { x: 5, y: 5 } }); // moves focus off the controls
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("Space");
      await expect(bar(page)).toHaveCount(0);
    } finally {
      await removeUser(user);
    }
  });

  test("Escape cancels: the stencil is gone and the transfer dialog is back", async ({ page }) => {
    const user = await ready(page, "esc");
    try {
      await transfer(page);
      await expect(page.locator(".stencil-file__name")).toHaveText("line.png");
      await page.keyboard.press("Escape");
      await expect(bar(page)).toHaveCount(0);
      await expect(page.locator(".stencil-handles")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toBeVisible(); // back to the dialog
      await page.keyboard.press("Escape"); // closes the dialog (not a second cancel)
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator(".stencil-file__name")).toHaveCount(0);
      // Free drawing works again, since there is no stencil to place.
      await selectLiner(page);
      await drawStroke(page);
      await expect(passes(page)).toHaveText("1");
    } finally {
      await removeUser(user);
    }
  });

  test("the on-screen buttons do the same as the keys", async ({ page }) => {
    const user = await ready(page, "buttons");
    try {
      await transfer(page);
      await bar(page).getByTestId("placement-cancel").click();
      await expect(bar(page)).toHaveCount(0);
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await transfer(page);
      await bar(page).getByTestId("placement-apply").click();
      await expect(bar(page)).toHaveCount(0);
      await expect(page.locator(".stencil-handles")).toHaveCount(0);
    } finally {
      await removeUser(user);
    }
  });

  test("with the bar showing, the whole toolbar is still on screen on an iPad-sized screen", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    const user = await ready(page, "padbar");
    try {
      await transfer(page);
      await expect(bar(page)).toBeVisible();
      const [barBox, toolbarBox] = await Promise.all([bar(page).boundingBox(), page.locator(".toolbar").boundingBox()]);
      expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(1180);
      expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(toolbarBox!.y + 1); // the bar sits above the toolbar, not over it
      expect(barBox!.x).toBeGreaterThanOrEqual(0);
      expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(820);
    } finally {
      await removeUser(user);
    }
  });
});
