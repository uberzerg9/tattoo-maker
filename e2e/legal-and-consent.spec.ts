import { expect, test } from "@playwright/test";

test.describe("legal pages and the cookie banner", () => {
  test("Terms and Privacy are public, marked as drafts, and switch language", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("tt.analyticsConsent", "denied"));
    for (const doc of ["terms", "privacy"]) {
      await page.goto(`/${doc}`);
      await expect(page.getByTestId("legal-draft")).toContainText("DRAFT — NEEDS LEGAL REVIEW");
      await page.getByRole("button", { name: "RU", exact: true }).click();
      await expect(page.getByTestId("legal-draft")).toContainText("ЧЕРНОВИК");
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");
      await page.getByRole("button", { name: "RO", exact: true }).click();
      await expect(page.getByTestId("legal-draft")).toContainText("CIORNĂ");
      await page.getByRole("button", { name: "EN", exact: true }).click();
    }
  });

  test("the privacy text says what is stored, where, and how to delete it", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("tt.analyticsConsent", "denied"));
    await page.goto("/privacy");
    const text = page.locator(".legal-card");
    await expect(text).toContainText("europe-west3");
    await expect(text).toContainText("Profile → Delete account");
    await expect(text).toContainText("Analytics, only if you accept");
  });

  test("the banner asks once, remembers the answer, and comes back from the footer", async ({ page }) => {
    const banner = page.getByRole("region", { name: "Analytics cookies" });
    await page.goto("/login");
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("button")).toHaveText(["REJECT", "ACCEPT"]);
    await banner.getByRole("button", { name: "REJECT" }).click();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("tt.analyticsConsent"))).toBe("denied");
    await page.reload();
    await expect(page.getByRole("button", { name: "Cookie settings" })).toBeVisible();
    await expect(banner).toHaveCount(0);
    await page.getByRole("button", { name: "Cookie settings" }).click();
    await expect(banner).toBeVisible();
  });

  test("the footer on the login page links to both texts", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("tt.analyticsConsent", "denied"));
    await page.goto("/login");
    const footer = page.getByRole("navigation", { name: "Legal and cookies" });
    await expect(footer.getByRole("link")).toHaveText(["Terms", "Privacy"]);
  });
});
