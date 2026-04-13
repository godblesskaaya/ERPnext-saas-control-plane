import { expect, test } from "@playwright/test";

import { createFakeJwt } from "./helpers/token";

test.describe("admin route browser guard", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("non-admin token is redirected to workspace overview with admin-required reason", async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("erp_saas_token", token);
    }, createFakeJwt({ role: "member" }));

    await page.goto("/app/admin/control-overview");

    await expect(page).toHaveURL(/\/app\/overview\?reason=admin-required$/);
  });

  test("admin token can remain on /app/admin/*", async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("erp_saas_token", token);
    }, createFakeJwt({ role: "admin" }));

    await page.goto("/app/admin/control-overview");

    await expect(page).toHaveURL(/\/app\/admin\/control-overview/);
  });
});
