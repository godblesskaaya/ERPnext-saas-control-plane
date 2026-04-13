import assert from "node:assert/strict";
import test from "node:test";

import { getWorkspaceLocalNavForPath, resolveWorkspaceKeyFromPath } from "./workspace";

test("resolveWorkspaceKeyFromPath maps workspace routes to expected workspace keys", () => {
  assert.equal(resolveWorkspaceKeyFromPath("/app/overview"), "overview");
  assert.equal(resolveWorkspaceKeyFromPath("/app/tenants"), "tenants");
  assert.equal(resolveWorkspaceKeyFromPath("/app/tenants/acme"), "tenants");
  assert.equal(resolveWorkspaceKeyFromPath("/app/billing/invoices"), "billing");
  assert.equal(resolveWorkspaceKeyFromPath("/app/support/queue"), "support");
  assert.equal(resolveWorkspaceKeyFromPath("/app/platform/health"), "platform");
  assert.equal(resolveWorkspaceKeyFromPath("/app/account/profile"), "account");
});

test("getWorkspaceLocalNavForPath returns the matching local section", () => {
  const tenantsSection = getWorkspaceLocalNavForPath("/app/tenants");
  const billingSection = getWorkspaceLocalNavForPath("/app/billing/invoices");

  assert.equal(tenantsSection.title, "Tenants workspace");
  assert.equal(
    tenantsSection.items.some((item) => item.href === "/app/tenants"),
    true,
  );

  assert.equal(billingSection.title, "Billing workspace");
  assert.equal(
    billingSection.items.some((item) => item.href === "/app/billing/invoices"),
    true,
  );
});
