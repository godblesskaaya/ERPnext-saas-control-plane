import { expect, test } from "@playwright/test";

import { createFakeJwt } from "./helpers/token";

test.describe("admin route browser guard", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("non-admin token is redirected away from /admin/control/*", async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("erp_saas_token", token);
    }, createFakeJwt({ role: "member" }));

    await page.goto("/admin/control/overview");

    await expect(page).not.toHaveURL(/\/admin\/control\/overview/);
  });

  test("admin token can remain on /admin/control/*", async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("erp_saas_token", token);
    }, createFakeJwt({ role: "admin" }));

    await page.goto("/admin/control/overview");

    await expect(page).toHaveURL(/\/admin\/control\/overview/);
  });
});
