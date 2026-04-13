import assert from "node:assert/strict";
import test from "node:test";

import { getWorkspaceLocalNavForPath, resolveWorkspaceKeyFromPath } from "./workspace";

test("resolveWorkspaceKeyFromPath maps canonical app routes to the expected workspace keys", () => {
  assert.equal(resolveWorkspaceKeyFromPath("/app/overview"), "overview");
  assert.equal(resolveWorkspaceKeyFromPath("/app/overview/activity"), "overview");
  assert.equal(resolveWorkspaceKeyFromPath("/app/tenants"), "tenants");
  assert.equal(resolveWorkspaceKeyFromPath("/app/tenants/acme"), "tenants");
  assert.equal(resolveWorkspaceKeyFromPath("/app/billing/invoices"), "billing");
  assert.equal(resolveWorkspaceKeyFromPath("/app/billing/recovery"), "billing");
  assert.equal(resolveWorkspaceKeyFromPath("/app/support/queue"), "support");
  assert.equal(resolveWorkspaceKeyFromPath("/app/platform/health"), "platform");
  assert.equal(resolveWorkspaceKeyFromPath("/app/platform/onboarding"), "platform");
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

test("workspace local nav publishes canonical app hrefs while keeping legacy match aliases", () => {
  const sections = [
    getWorkspaceLocalNavForPath("/app/overview"),
    getWorkspaceLocalNavForPath("/app/tenants"),
    getWorkspaceLocalNavForPath("/app/billing/invoices"),
    getWorkspaceLocalNavForPath("/app/support/queue"),
    getWorkspaceLocalNavForPath("/app/platform/provisioning"),
    getWorkspaceLocalNavForPath("/app/account/profile"),
  ];

  for (const section of sections) {
    for (const item of section.items) {
      assert.equal(item.href.startsWith("/app/"), true, `expected canonical app href for ${item.href}`);
      assert.equal(
        item.match?.some((match) => !match.startsWith("/app/")) ?? false,
        true,
        `expected at least one legacy match alias for ${item.href}`,
      );
    }
  }
});
