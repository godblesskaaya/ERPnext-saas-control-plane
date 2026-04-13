import { expect, test } from "@playwright/test";

import { createFakeJwt } from "./helpers/token";

test.describe("auth shell route guards", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("redirects app overview guests to login with next param", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("erp_saas_token");
      window.localStorage.removeItem("erp_saas_role");
      window.localStorage.removeItem("erp_saas_user");
    });

    await page.goto("/app/overview");

    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Foverview/);
  });

  test("redirects app admin control overview guests to login with next param", async ({ page }) => {
    await page.goto("/app/admin/control-overview");

    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fadmin%2Fcontrol-overview/);
  });

  test("keeps authenticated users on app overview", async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("erp_saas_token", token);
    }, createFakeJwt({ role: "member" }));

    await page.goto("/app/overview");

    await expect(page).toHaveURL(/\/app\/overview/);
  });

  test("redirects legacy dashboard root to canonical workspace overview", async ({ page }) => {
    await page.route("**/api/admin/metrics", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not Found" }),
      });
    });

    await page.addInitScript((token: string) => {
      window.localStorage.setItem("erp_saas_token", token);
    }, createFakeJwt({ role: "member" }));

    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/app\/overview$/);
  });
});
