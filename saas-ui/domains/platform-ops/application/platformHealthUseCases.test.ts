import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  getPlatformOpsErrorMessage,
  loadPlatformHealthSnapshot,
  runPlatformMaintenanceAction,
} from "./platformHealthUseCases";
import { api } from "../../shared/lib/api";

const originalFetch = globalThis.fetch;
const originalApi = {
  listAdminJobs: api.listAdminJobs,
  listTenants: api.listTenants,
  authHealth: api.authHealth,
  billingHealth: api.billingHealth,
  rebuildPlatformAssets: api.rebuildPlatformAssets,
  syncTenantTLS: api.syncTenantTLS,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  api.listAdminJobs = originalApi.listAdminJobs;
  api.listTenants = originalApi.listTenants;
  api.authHealth = originalApi.authHealth;
  api.billingHealth = originalApi.billingHealth;
  api.rebuildPlatformAssets = originalApi.rebuildPlatformAssets;
  api.syncTenantTLS = originalApi.syncTenantTLS;
});

test("loadPlatformHealthSnapshot returns merged health, jobs, tenants, and service statuses", async () => {
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({ status: "ok", service: "api", checks: { postgres: "ok", redis: "ok" } }),
    }) as Response) as typeof fetch;

  api.listAdminJobs = async () => ({
    supported: true,
    data: [
      {
        id: "job-1",
        tenant_id: "tenant-1",
        type: "provision",
        status: "running",
        logs: "in progress",
      },
    ],
  });
  api.listTenants = async () => [
    {
      id: "tenant-1",
      owner_id: "owner-1",
      subdomain: "alpha",
      domain: "alpha.example.com",
      site_name: "alpha",
      company_name: "Alpha",
      plan: "business",
      status: "active",
      created_at: "2026-03-23T00:00:00Z",
      updated_at: "2026-03-23T00:00:00Z",
    },
  ];
  api.authHealth = async () => ({ supported: true, data: { message: "auth-ok" } });
  api.billingHealth = async () => ({ supported: true, data: { message: "billing-ok" } });

  const snapshot = await loadPlatformHealthSnapshot();

  assert.equal(snapshot.healthAvailable, true);
  assert.equal(snapshot.health?.status, "ok");
  assert.equal(snapshot.jobs.length, 1);
  assert.equal(snapshot.tenants.length, 1);
  assert.equal(snapshot.authHealth, "auth-ok");
  assert.equal(snapshot.billingHealth, "billing-ok");
});

test("loadPlatformHealthSnapshot gracefully handles unavailable/unsupported endpoints", async () => {
  globalThis.fetch = (async () => ({ ok: false }) as Response) as typeof fetch;

  api.listAdminJobs = async () => ({ supported: false, data: null });
  api.listTenants = async () => [];
  api.authHealth = async () => ({ supported: false, data: null });
  api.billingHealth = async () => ({ supported: false, data: null });

  const snapshot = await loadPlatformHealthSnapshot();

  assert.equal(snapshot.healthAvailable, false);
  assert.equal(snapshot.health, null);
  assert.deepEqual(snapshot.jobs, []);
  assert.deepEqual(snapshot.tenants, []);
  assert.equal(snapshot.authHealth, "unsupported");
  assert.equal(snapshot.billingHealth, "unsupported");
});

test("runPlatformMaintenanceAction dispatches actions and returns stable messages", async () => {
  api.rebuildPlatformAssets = async () => ({ supported: true, data: { message: "assets queued" } });
  api.syncTenantTLS = async (primeCerts = false) =>
    primeCerts
      ? { supported: false, data: null }
      : { supported: true, data: { message: "tls sync queued" } };

  const assets = await runPlatformMaintenanceAction("assets");
  const tls = await runPlatformMaintenanceAction("tls");
  const tlsPrime = await runPlatformMaintenanceAction("tls-prime");

  assert.deepEqual(assets, { supported: true, message: "assets queued" });
  assert.deepEqual(tls, { supported: true, message: "tls sync queued" });
  assert.deepEqual(tlsPrime, {
    supported: false,
    message: "Maintenance actions aren’t available on this deployment.",
  });

  const errorMessage = getPlatformOpsErrorMessage(new Error("boom"), "fallback");
  assert.equal(errorMessage, "boom");
});
