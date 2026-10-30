import { expect, test } from "@playwright/test";
import { declineCookies, newUser, removeUser, signUp } from "./support.ts";

test.describe("browsers that cannot run the engine", () => {
  test("no WebGL 2: a full-page screen, the profile still opens, log out works", async ({ page }) => {
    const user = newUser("nogl");
    await declineCookies(page);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return type === "webgl2" ? null : (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    try {
      await signUp(page, user);
      const screen = page.getByTestId("unsupported-screen");
      await expect(screen).toBeVisible({ timeout: 30_000 });
      await expect(screen).toHaveAttribute("data-reason", "webgl2");
      await expect(screen).toContainText("CAN'T RUN THE TRAINER");
      await expect(screen).toContainText("hardware acceleration");

      await screen.getByRole("link", { name: "OPEN PROFILE" }).click();
      await expect(page.getByTestId("profile-page")).toBeVisible();
      await page.goto("/");
      await screen.getByRole("button", { name: "LOG OUT" }).click();
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await removeUser(user);
    }
  });

  test("no float render targets: the same screen, with its own reason", async ({ page }) => {
    const user = newUser("nofloat");
    await declineCookies(page);
    await page.addInitScript(() => {
      const original = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (this: WebGL2RenderingContext, name: string) {
        return name === "EXT_color_buffer_float" ? null : (original as (n: string) => unknown).call(this, name);
      } as typeof WebGL2RenderingContext.prototype.getExtension;
    });
    try {
      await signUp(page, user);
      const screen = page.getByTestId("unsupported-screen");
      await expect(screen).toBeVisible({ timeout: 30_000 });
      await expect(screen).toHaveAttribute("data-reason", "float-render-targets");
    } finally {
      await removeUser(user);
    }
  });
});
