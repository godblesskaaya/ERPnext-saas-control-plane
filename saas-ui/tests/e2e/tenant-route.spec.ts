import { expect, test } from "@playwright/test";

import { createFakeJwt } from "./helpers/token";

test.describe("tenant route browser flow", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("tenant root and explicit overview routes converge on the tenant overview shell", async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("erp_saas_token", token);
    }, createFakeJwt({ role: "member" }));

    await page.goto("/tenants/demo");

    await expect(page).toHaveURL(/\/tenants\/demo(?:\/overview)?$/);
    await expect(page.getByRole("heading", { name: "Tenant overview" })).toBeVisible();

    await page.goto("/tenants/demo/overview");

    await expect(page).toHaveURL(/\/tenants\/demo\/overview$/);
    await expect(page.getByRole("heading", { name: "Tenant overview" })).toBeVisible();
    await expect(page.getByText("Tenant navigation")).toBeVisible();
  });

  test("tenant entity navigation is visible on tenant routes", async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("erp_saas_token", token);
    }, createFakeJwt({ role: "member" }));

    await page.goto("/tenants/demo");

    await expect(page.getByText("Tenant navigation")).toBeVisible();
  });
});
