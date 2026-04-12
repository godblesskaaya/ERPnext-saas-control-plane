import assert from "node:assert/strict";
import test from "node:test";

import {
  loadDashboardMetricsSnapshot,
  loadDashboardServiceHealthSnapshot,
} from "./dashboardUseCases";

test("loadDashboardMetricsSnapshot returns metrics when endpoint is supported", async () => {
  const metrics = await loadDashboardMetricsSnapshot({
    fetchMetrics: async () => ({
      supported: true,
      data: {
        total_tenants: 10,
        active_tenants: 8,
        suspended_tenants: 1,
        failed_tenants: 1,
        provisioning_tenants: 2,
        pending_payment_tenants: 1,
        trialing_tenants: 1,
        trial_converted_tenants: 6,
        trial_expired_past_due_tenants: 1,
        trial_cancelled_tenants: 0,
        jobs_last_24h: 31,
        provisioning_success_rate_7d: 98,
        dead_letter_count: 0,
        support_open_notes: 2,
        support_breached_notes: 0,
        support_due_soon_notes: 1,
      },
    }),
    fetchAuth: async () => ({ supported: false, data: null }),
    fetchBilling: async () => ({ supported: false, data: null }),
  });

  assert.equal(metrics?.total_tenants, 10);
  assert.equal(metrics?.jobs_last_24h, 31);
});

test("loadDashboardMetricsSnapshot gracefully handles unsupported/errors", async () => {
  const unsupported = await loadDashboardMetricsSnapshot({
    fetchMetrics: async () => ({ supported: false, data: null }),
    fetchAuth: async () => ({ supported: false, data: null }),
    fetchBilling: async () => ({ supported: false, data: null }),
  });
  assert.equal(unsupported, null);

  const unavailable = await loadDashboardMetricsSnapshot({
    fetchMetrics: async () => {
      throw new Error("boom");
    },
    fetchAuth: async () => ({ supported: false, data: null }),
    fetchBilling: async () => ({ supported: false, data: null }),
  });
  assert.equal(unavailable, null);
});

test("loadDashboardServiceHealthSnapshot maps supported/unsupported/unavailable states", async () => {
  const snapshot = await loadDashboardServiceHealthSnapshot({
    fetchMetrics: async () => ({ supported: false, data: null }),
    fetchAuth: async () => ({ supported: true, data: { message: "auth-ok" } }),
    fetchBilling: async () => ({ supported: false, data: null }),
  });

  assert.deepEqual(snapshot, {
    auth: { state: "ok", message: "auth-ok" },
    billing: { state: "unsupported", message: "unsupported" },
  });

  const unavailable = await loadDashboardServiceHealthSnapshot({
    fetchMetrics: async () => ({ supported: false, data: null }),
    fetchAuth: async () => {
      throw new Error("offline");
    },
    fetchBilling: async () => {
      throw new Error("offline");
    },
  });

  assert.deepEqual(unavailable, {
    auth: { state: "unavailable", message: "unavailable" },
    billing: { state: "unavailable", message: "unavailable" },
  });
});
