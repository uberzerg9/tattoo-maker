import { expect, test } from "@playwright/test";
import { countDocs, declineCookies, drawStroke, logIn, newUser, removeUser, seedUser, selectLiner, storageFiles, getDoc } from "./support.ts";

/** These run against the app built with VITE_DISABLE_WRITES=true, as the preview channel serves it. */
test.describe("preview build: saving disabled", () => {
  test("shows the badge, offers no way to save, and writes nothing", async ({ page }) => {
    const user = newUser("prev");
    const uid = await seedUser(user);
    await declineCookies(page);
    try {
      await logIn(page, user);
      await expect(page.getByTestId("preview-badge")).toHaveText("Preview — saving disabled");
      await expect(page.locator(".topbar__avatar")).toBeVisible({ timeout: 30_000 });

      // Draw and try to save: SAVE is disabled and no "unsaved" notice appears.
      await page.getByTestId("onboarding").getByRole("button", { name: "SKIP" }).click();
      await selectLiner(page);
      await drawStroke(page);
      await expect(page.locator(".feedback__num").first()).toHaveText("1");
      await expect(page.getByRole("button", { name: "SAVE", exact: true })).toBeDisabled();
      await expect(page.getByTestId("save-status")).toHaveCount(0);

      // Changing the language still works on screen but is not stored; leaving ends the session without recording it.
      await page.locator(".topbar__avatar").click();
      await page.getByRole("button", { name: /Русский/ }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");
      await page.goto("/profile");
      await expect(page.getByTestId("profile-page")).toBeVisible();
      await expect(page.getByRole("button", { name: "SAVE CHANGES" })).toBeDisabled();
      await page.waitForTimeout(2000); // the panel layout write would be debounced by about a second

      expect(await countDocs(`users/${uid}/works`)).toBe(0);
      expect(await countDocs(`users/${uid}/sessions`)).toBe(0);
      expect(await storageFiles(`users/${uid}/`)).toEqual([]);
      expect((await getDoc(`users/${uid}`))?.language?.stringValue).toBe("en");
      expect((await getDoc(`users/${uid}`))?.settings).toBeDefined();
    } finally {
      await removeUser(user);
    }
  });

  test("sign-up is switched off, and account changes are disabled", async ({ page }) => {
    await declineCookies(page);
    await page.goto("/signup");
    await expect(page.getByTestId("preview-badge")).toBeVisible();
    await expect(page.getByTestId("signup-disabled")).toBeVisible();
    await page.getByRole("checkbox", { name: /I agree/ }).check();
    await expect(page.getByRole("button", { name: "CREATE ACCOUNT" })).toBeDisabled();

    const user = newUser("prev2");
    await seedUser(user);
    try {
      await logIn(page, user);
      await expect(page.locator(".topbar__avatar")).toBeVisible({ timeout: 30_000 }); // signed in before leaving the page
      await page.goto("/profile");
      await expect(page.getByRole("button", { name: "DELETE ACCOUNT" })).toBeDisabled();
    } finally {
      await removeUser(user);
    }
  });
});
