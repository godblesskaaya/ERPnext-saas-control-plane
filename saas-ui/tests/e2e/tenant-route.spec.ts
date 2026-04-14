import { expect, test, type Page } from "@playwright/test";

import { createFakeJwt } from "./helpers/token";

function nowIso() {
  return new Date().toISOString();
}

async function authenticateWorkspaceMember(page: Page) {
  await page.addInitScript((token: string) => {
    window.localStorage.setItem("erp_saas_token", token);
  }, createFakeJwt({ role: "admin" }));
}

async function mockTenantApis(page: Page) {
  const tenant = {
    id: "demo",
    owner_id: "owner-demo",
    subdomain: "demo",
    domain: "demo.erp.blenkotechnologies.co.tz",
    site_name: "demo",
    company_name: "Demo Workspace Ltd",
    plan: "growth",
    status: "active",
    billing_status: "paid",
    payment_channel: "mobile_money",
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "admin-e2e",
        email: "admin@example.com",
        role: "admin",
        email_verified: true,
        created_at: nowIso(),
      }),
    });
  });

  await page.route("**/api/tenants/demo", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tenant),
    });
  });

  await page.route("**/api/tenants/demo/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total_members: 2,
        active_users: 2,
        active_domains: 1,
        open_support_notes: 0,
        failed_jobs_24h: 0,
      }),
    });
  });

  await page.route("**/api/admin/jobs?limit=40", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "job-demo-1",
          tenant_id: "demo",
          type: "provision",
          status: "running",
          created_at: nowIso(),
          updated_at: nowIso(),
          logs: [],
        },
      ]),
    });
  });

  await page.route("**/api/tenants/demo/members", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "member-demo-1",
          user_id: "user-demo-1",
          email: "ops@example.com",
          role: "admin",
          joined_at: nowIso(),
        },
      ]),
    });
  });

  await page.route("**/api/tenants/demo/subscription", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tenant_id: "demo",
        status: "active",
        payment_provider: "azampay",
        selected_app: "erpnext",
        trial_ends_at: nowIso(),
        cancelled_at: null,
        current_period_start: nowIso(),
        current_period_end: nowIso(),
        plan: {
          code: "growth",
          display_name: "Growth",
          isolation_model: "single_tenant",
          support_channel: "priority",
        },
      }),
    });
  });

  await page.route("**/api/admin/support-notes?tenant_id=demo", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

test.describe("tenant route browser flow", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("legacy and canonical tenant overview routes converge on canonical /app tenant overview", async ({ page }) => {
    await authenticateWorkspaceMember(page);
    await mockTenantApis(page);

    await page.goto("/tenants/demo");
    await expect(page).toHaveURL(/\/app\/tenants\/demo\/overview$/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("Demo Workspace Ltd")).toBeVisible();

    await page.goto("/app/tenants/demo/overview");
    await expect(page).toHaveURL(/\/app\/tenants\/demo\/overview$/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });

  test("tenant section navigation supports canonical workflow hops", async ({ page }) => {
    await authenticateWorkspaceMember(page);
    await mockTenantApis(page);

    await page.goto("/app/tenants/demo/overview");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.getByRole("link", { name: "Team" }).click();
    await expect(page).toHaveURL(/\/app\/tenants\/demo\/members$/);
    await expect(page.getByRole("heading", { name: "Team members" })).toBeVisible();
    await expect(page.getByText("Invite teammate")).toBeVisible();

    await page.getByRole("link", { name: "Jobs" }).click();
    await expect(page).toHaveURL(/\/app\/tenants\/demo\/jobs$/);
    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
    await expect(page.getByText("Recent jobs")).toBeVisible();

    await page.getByRole("link", { name: "Subscription" }).click();
    await expect(page).toHaveURL(/\/app\/tenants\/demo\/billing$/);
    await expect(page.getByRole("heading", { name: "Billing & subscription" })).toBeVisible();
    await expect(page.getByText("Subscription details")).toBeVisible();

    await page.getByRole("link", { name: "Support notes" }).click();
    await expect(page).toHaveURL(/\/app\/tenants\/demo\/support$/);
    await expect(page.getByRole("heading", { name: "Support notes" })).toBeVisible();
    await expect(page.getByText("Create support note")).toBeVisible();
  });
});
