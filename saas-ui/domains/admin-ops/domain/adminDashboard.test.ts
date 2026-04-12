import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTenantActionPhrase,
  deriveAdminMetricAlertKey,
  deriveAdminMetricAlerts,
  deriveAdminTenantCounts,
} from "./adminDashboard";

test("deriveAdminTenantCounts categorizes status buckets", () => {
  const counts = deriveAdminTenantCounts([
    {
      id: "t-1",
      owner_id: "u-1",
      subdomain: "alpha",
      domain: "alpha.example.com",
      site_name: "alpha",
      company_name: "Alpha",
      plan: "starter",
      status: "active",
      created_at: "2026-03-23T00:00:00Z",
      updated_at: "2026-03-23T00:00:00Z",
    },
    {
      id: "t-2",
      owner_id: "u-1",
      subdomain: "beta",
      domain: "beta.example.com",
      site_name: "beta",
      company_name: "Beta",
      plan: "business",
      status: "pending_payment",
      created_at: "2026-03-23T00:00:00Z",
      updated_at: "2026-03-23T00:00:00Z",
    },
    {
      id: "t-3",
      owner_id: "u-1",
      subdomain: "gamma",
      domain: "gamma.example.com",
      site_name: "gamma",
      company_name: "Gamma",
      plan: "business",
      status: "failed",
      created_at: "2026-03-23T00:00:00Z",
      updated_at: "2026-03-23T00:00:00Z",
    },
    {
      id: "t-4",
      owner_id: "u-1",
      subdomain: "delta",
      domain: "delta.example.com",
      site_name: "delta",
      company_name: "Delta",
      plan: "enterprise",
      status: "suspended_billing",
      created_at: "2026-03-23T00:00:00Z",
      updated_at: "2026-03-23T00:00:00Z",
    },
  ]);

  assert.equal(counts.activeCount, 1);
  assert.equal(counts.provisioningCount, 1);
  assert.equal(counts.failedCount, 1);
  assert.equal(counts.suspendedCount, 1);
});

test("deriveAdminMetricAlerts returns warnings only when thresholds are non-zero", () => {
  const alertKey = deriveAdminMetricAlertKey({
    total_tenants: 5,
    active_tenants: 4,
    suspended_tenants: 1,
    failed_tenants: 2,
    provisioning_tenants: 3,
    pending_payment_tenants: 1,
    trialing_tenants: 1,
    trial_converted_tenants: 2,
    trial_expired_past_due_tenants: 1,
    trial_cancelled_tenants: 0,
    jobs_last_24h: 22,
    provisioning_success_rate_7d: 93,
    dead_letter_count: 4,
    support_open_notes: 2,
    support_breached_notes: 1,
    support_due_soon_notes: 2,
  });
  const alerts = deriveAdminMetricAlerts({
    total_tenants: 5,
    active_tenants: 4,
    suspended_tenants: 1,
    failed_tenants: 2,
    provisioning_tenants: 3,
    pending_payment_tenants: 1,
    trialing_tenants: 1,
    trial_converted_tenants: 2,
    trial_expired_past_due_tenants: 1,
    trial_cancelled_tenants: 0,
    jobs_last_24h: 22,
    provisioning_success_rate_7d: 93,
    dead_letter_count: 4,
    support_open_notes: 2,
    support_breached_notes: 1,
    support_due_soon_notes: 2,
  });

  assert.equal(alertKey, "2-4-3");
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0]?.title, "Provisioning failures detected");
  assert.equal(alerts[1]?.title, "Dead-letter queue backlog");
});

test("buildTenantActionPhrase uppercases subdomain token", () => {
  assert.equal(buildTenantActionPhrase("alpha-ops"), "ALPHA-OPS");
});
