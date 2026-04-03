import { expect, test } from "@playwright/test";

import { createFakeJwt } from "./helpers/token";

test.describe("auth shell route guards", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("redirects dashboard overview guests to login with next param", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("erp_saas_token");
      window.localStorage.removeItem("erp_saas_role");
      window.localStorage.removeItem("erp_saas_user");
    });

    await page.goto("/dashboard/overview");

    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Foverview/);
  });

  test("redirects admin control overview guests to login with next param", async ({ page }) => {
    await page.goto("/admin/control/overview");

    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fcontrol%2Foverview/);
  });

  test("keeps authenticated users on dashboard overview", async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("erp_saas_token", token);
    }, createFakeJwt({ role: "member" }));

    await page.goto("/dashboard/overview");

    await expect(page).toHaveURL(/\/dashboard\/overview/);
  });
});
