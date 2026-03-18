import test from "node:test";
import assert from "node:assert/strict";

import {
  applyWorkspaceQueueFallbackFilters,
  applyWorkspaceQueueSearchFallback,
  deriveWorkspaceQueueMetrics,
  normalizeWorkspaceQueueValue,
} from "./workspaceQueue";
import type { Tenant } from "../../shared/lib/types";

function makeTenant(overrides: Partial<Tenant>): Tenant {
  return {
    id: overrides.id ?? "tenant-1",
    owner_id: overrides.owner_id ?? "owner-1",
    subdomain: overrides.subdomain ?? "demo",
    domain: overrides.domain ?? "demo.example.com",
    site_name: overrides.site_name ?? "demo",
    company_name: overrides.company_name ?? "Demo Co",
    plan: overrides.plan ?? "starter",
    status: overrides.status ?? "active",
    created_at: overrides.created_at ?? "2026-03-18T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-03-18T00:00:00Z",
    ...overrides,
  };
}

test("normalizeWorkspaceQueueValue lowercases and handles nullish", () => {
  assert.equal(normalizeWorkspaceQueueValue("  Pending_Payment  "), "pending_payment");
  assert.equal(normalizeWorkspaceQueueValue(undefined), "");
  assert.equal(normalizeWorkspaceQueueValue(null), "");
});

test("applyWorkspaceQueueFallbackFilters supports OR mode for status/billing/channel", () => {
  const tenants = [
    makeTenant({ id: "t-1", status: "active", billing_status: "paid", payment_channel: "card" }),
    makeTenant({ id: "t-2", status: "pending", billing_status: "paid", payment_channel: "mobile_money" }),
    makeTenant({ id: "t-3", status: "active", billing_status: "past_due", payment_channel: "bank_transfer" }),
  ];

  const filtered = applyWorkspaceQueueFallbackFilters(tenants, {
    statusFilter: ["pending"],
    billingFilter: ["past_due"],
    paymentChannelFilter: ["card"],
    billingFilterMode: "or",
  });

  assert.deepEqual(
    filtered.map((tenant) => tenant.id),
    ["t-1", "t-2", "t-3"]
  );
});

test("applyWorkspaceQueueFallbackFilters applies AND mode filters", () => {
  const tenants = [
    makeTenant({ id: "t-1", status: "pending", billing_status: "past_due", payment_channel: "card" }),
    makeTenant({ id: "t-2", status: "pending", billing_status: "paid", payment_channel: "card" }),
    makeTenant({ id: "t-3", status: "active", billing_status: "past_due", payment_channel: "card" }),
  ];

  const filtered = applyWorkspaceQueueFallbackFilters(tenants, {
    statusFilter: ["pending"],
    billingFilter: ["past_due"],
    paymentChannelFilter: ["card"],
    billingFilterMode: "and",
  });

  assert.deepEqual(
    filtered.map((tenant) => tenant.id),
    ["t-1"]
  );
});

test("applyWorkspaceQueueSearchFallback matches company/domain/channel", () => {
  const tenants = [
    makeTenant({ id: "t-1", company_name: "Arusha Retail", domain: "arusha.example.com", payment_channel: "card" }),
    makeTenant({ id: "t-2", company_name: "Mwanza Foods", domain: "mwanza.example.com", payment_channel: "mobile_money" }),
  ];

  assert.deepEqual(
    applyWorkspaceQueueSearchFallback(tenants, "Mwanza").map((tenant) => tenant.id),
    ["t-2"]
  );
  assert.deepEqual(
    applyWorkspaceQueueSearchFallback(tenants, "mobile").map((tenant) => tenant.id),
    ["t-2"]
  );
});

test("deriveWorkspaceQueueMetrics derives queue counters", () => {
  const tenants = [
    makeTenant({ id: "t-1", status: "active", billing_status: "paid" }),
    makeTenant({ id: "t-2", status: "pending_payment", billing_status: "past_due" }),
    makeTenant({ id: "t-3", status: "pending", billing_status: "failed" }),
    makeTenant({ id: "t-4", status: "suspended_billing", billing_status: "unpaid" }),
    makeTenant({ id: "t-5", status: "failed", billing_status: "cancelled" }),
  ];

  const metrics = deriveWorkspaceQueueMetrics(tenants, 2);

  assert.equal(metrics.totalTenants, 5);
  assert.equal(metrics.activeTenants, 1);
  assert.equal(metrics.pendingPaymentTenants, 1);
  assert.equal(metrics.provisioningQueueTenants, 1);
  assert.equal(metrics.suspendedBillingTenants, 1);
  assert.equal(metrics.provisioningTenants, 2);
  assert.equal(metrics.failedTenants, 1);
  assert.equal(metrics.failedBillingTenants, 4);
  assert.equal(metrics.billingQueueCount, 6);
  assert.equal(metrics.suspendedTenants, 1);
  assert.equal(metrics.needsAttentionCount, 5);
});
