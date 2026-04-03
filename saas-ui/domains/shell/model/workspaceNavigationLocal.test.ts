import assert from "node:assert/strict";
import test from "node:test";

import { getWorkspaceLocalNavForPath, resolveWorkspaceKeyFromPath } from "./workspace";

test("resolveWorkspaceKeyFromPath maps workspace routes to expected workspace keys", () => {
  assert.equal(resolveWorkspaceKeyFromPath("/dashboard/overview"), "overview");
  assert.equal(resolveWorkspaceKeyFromPath("/dashboard/registry"), "tenants");
  assert.equal(resolveWorkspaceKeyFromPath("/tenants/acme"), "tenants");
  assert.equal(resolveWorkspaceKeyFromPath("/billing"), "billing");
  assert.equal(resolveWorkspaceKeyFromPath("/dashboard/support"), "support");
  assert.equal(resolveWorkspaceKeyFromPath("/dashboard/platform-health"), "platform");
  assert.equal(resolveWorkspaceKeyFromPath("/dashboard/account"), "account");
});

test("getWorkspaceLocalNavForPath returns the matching local section", () => {
  const tenantsSection = getWorkspaceLocalNavForPath("/dashboard/registry");
  const billingSection = getWorkspaceLocalNavForPath("/billing");

  assert.equal(tenantsSection.title, "Tenants workspace");
  assert.equal(
    tenantsSection.items.some((item) => item.href === "/dashboard/registry"),
    true,
  );

  assert.equal(billingSection.title, "Billing workspace");
  assert.equal(
    billingSection.items.some((item) => item.href === "/billing"),
    true,
  );
});

