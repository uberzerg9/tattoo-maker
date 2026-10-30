import { expect, test } from "@playwright/test";
import { declineCookies, drawStroke, getDoc, newUser, removeUser, selectLiner, signUp, storageFiles, uidOf } from "./support.ts";

test.describe("workspace", () => {
  test("sign up, take the tour once, draw a stroke, save it", async ({ page }) => {
    const user = newUser("flow");
    await declineCookies(page);
    try {
      await signUp(page, user);

      // The tour: four tips in order, then it is gone and stays gone.
      const tour = page.getByTestId("onboarding");
      await expect(tour).toBeVisible({ timeout: 30_000 });
      const seen: (string | null)[] = [];
      for (let i = 0; i < 4; i++) {
        seen.push(await tour.getAttribute("data-step"));
        await tour.getByRole("button", { name: i === 3 ? "GOT IT" : "NEXT" }).click();
      }
      expect(seen).toEqual(["cartridge", "dip", "stencil", "draw"]);
      await expect(tour).toHaveCount(0);
      await page.reload();
      await expect(page.locator(".topbar__avatar")).toBeVisible();
      await expect(tour).toHaveCount(0);

      // A stroke counts as a pass, and SAVE puts the work in the cloud.
      await selectLiner(page);
      await drawStroke(page);
      await expect(page.locator(".feedback__num").first()).toHaveText("1");
      await page.getByRole("button", { name: "SAVE", exact: true }).click();
      await expect(page.getByTestId("save-status")).toHaveText("Saved", { timeout: 45_000 });

      const uid = (await uidOf(user.email))!;
      expect(await storageFiles(`users/${uid}/works/`)).toHaveLength(3);
    } finally {
      await removeUser(user);
    }
  });

  test("the first tip can be skipped with Escape, and is not shown again", async ({ page }) => {
    const user = newUser("skip");
    await declineCookies(page);
    try {
      await signUp(page, user);
      const tour = page.getByTestId("onboarding");
      await expect(tour).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press("Escape");
      await expect(tour).toHaveCount(0);
      await page.reload();
      await expect(page.locator(".topbar__avatar")).toBeVisible();
      await page.waitForTimeout(1500);
      await expect(tour).toHaveCount(0);
    } finally {
      await removeUser(user);
    }
  });

  test("a new account gets its profile and username written by the sign-up", async ({ page }) => {
    const user = newUser("profile");
    await declineCookies(page);
    try {
      await signUp(page, user);
      await expect(page.locator(".topbar__avatar")).toBeVisible({ timeout: 30_000 });
      const uid = (await uidOf(user.email))!;
      expect((await getDoc(`users/${uid}`))?.username?.stringValue).toBe(user.username);
      expect((await getDoc(`usernames/${user.username}`))?.uid?.stringValue).toBe(uid);
    } finally {
      await removeUser(user);
    }
  });
});
