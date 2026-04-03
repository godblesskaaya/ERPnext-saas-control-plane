import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { createFakeJwt } from "./helpers/token";

function nowIso() {
  return new Date().toISOString();
}

async function authenticateWorkspaceMember(page: Page) {
  await page.addInitScript((token: string) => {
    window.localStorage.setItem("erp_saas_token", token);
  }, createFakeJwt({ role: "member" }));
}

async function mockDashboardOverviewApis(page: Page) {
  await page.route("**/api/tenants/paged**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "tenant-ci-shell-1",
            owner_id: "owner-ci-shell",
            subdomain: "shell-ci",
            domain: "shell-ci.example.com",
            site_name: "shell-ci",
            company_name: "Shell CI Workspace",
            plan: "starter",
            status: "active",
            billing_status: "paid",
            payment_channel: "card",
            created_at: nowIso(),
            updated_at: nowIso(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      }),
    });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "user-ci-shell",
        email: "shell-ci@example.com",
        role: "member",
        email_verified: true,
        created_at: nowIso(),
      }),
    });
  });

  await page.route("**/api/admin/metrics", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total_tenants: 1,
        active_tenants: 1,
        pending_payment_tenants: 0,
        jobs_last_24h: 2,
      }),
    });
  });

  await page.route("**/api/auth/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "ok" }),
    });
  });

  await page.route("**/api/billing/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "ok" }),
    });
  });
}

test.describe("workspace shell visual + accessibility checks", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 1440, height: 1200 });
  });

  test("keeps core workspace shell surfaces visually stable on dashboard overview", async ({ page }) => {
    await authenticateWorkspaceMember(page);
    await mockDashboardOverviewApis(page);

    await page.goto("/dashboard/overview");

    await expect(page).toHaveURL(/\/dashboard\/overview/);
    await expect(page.getByRole("heading", { name: "Workspace navigation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
    await expect(page.getByText("Filter workspaces")).toBeVisible();

    const sidebar = page.locator("aside").first();
    const overviewHeaderCard = page
      .locator('[class*="MuiCard-root"]')
      .filter({ has: page.getByRole("heading", { name: "Workspace overview" }) })
      .first();

    const shellStyles = await sidebar.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      return {
        position: styles.position,
        top: styles.top,
        borderRadius: styles.borderRadius,
      };
    });

    const headerStyles = await overviewHeaderCard.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      return {
        borderRadius: styles.borderRadius,
        borderStyle: styles.borderStyle,
      };
    });

    expect(shellStyles).toEqual({ position: "sticky", top: "96px", borderRadius: "24px" });
    expect(headerStyles).toEqual({ borderRadius: "16px", borderStyle: "solid" });
  });

  test("has no critical accessibility violations in authenticated workspace shell", async ({ page }) => {
    await authenticateWorkspaceMember(page);
    await mockDashboardOverviewApis(page);

    await page.goto("/dashboard/overview");

    await expect(page).toHaveURL(/\/dashboard\/overview/);
    await expect(page.getByRole("heading", { name: "Workspace navigation" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include("aside")
      .include("main, [role='main'], body")
      .disableRules(["color-contrast", "landmark-one-main", "page-has-heading-one", "region"])
      .analyze();

    const criticalViolations = results.violations.filter((violation) => violation.impact === "critical");
    expect(criticalViolations).toEqual([]);
  });
});
