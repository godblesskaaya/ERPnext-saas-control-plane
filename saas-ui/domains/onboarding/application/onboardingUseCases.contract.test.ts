import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  loadWorkspaceReadiness,
  restorePersistedTenant,
  submitTenantOnboarding,
  validateSubdomain,
} from "./onboardingUseCases";
import { api } from "../../shared/lib/api";
import type { TenantCreatePayload } from "../../shared/lib/types";

const originalApi = {
  checkSubdomainAvailability: api.checkSubdomainAvailability,
  createTenant: api.createTenant,
  getTenant: api.getTenant,
  getTenantReadiness: api.getTenantReadiness,
};

afterEach(() => {
  api.checkSubdomainAvailability = originalApi.checkSubdomainAvailability;
  api.createTenant = originalApi.createTenant;
  api.getTenant = originalApi.getTenant;
  api.getTenantReadiness = originalApi.getTenantReadiness;
});

test("validateSubdomain returns local invalid response before network call for short names", async () => {
  const availability = await validateSubdomain("ab");
  assert.equal(availability.available, false);
  assert.equal(availability.reason, "invalid");
});

test("validateSubdomain returns API availability with normalized fallback fields", async () => {
  api.checkSubdomainAvailability = async () => ({
    subdomain: "",
    domain: null,
    available: true,
    reason: null,
    message: "",
  });

  const availability = await validateSubdomain("biashara");
  assert.equal(availability.subdomain, "biashara");
  assert.equal(availability.available, true);
  assert.equal(availability.message, "Subdomain is available.");
});

test("submitTenantOnboarding sends chosen_app only for business plan", async () => {
  const captured: Array<Record<string, unknown>> = [];

  api.createTenant = async (payload: TenantCreatePayload) => {
    captured.push(payload as unknown as Record<string, unknown>);
    return {
      tenant: {
        id: "tenant-1",
        owner_id: "owner-1",
        subdomain: payload.subdomain,
        domain: `${payload.subdomain}.example.com`,
        site_name: payload.subdomain,
        company_name: payload.company_name,
        plan: payload.plan,
        chosen_app: payload.chosen_app ?? null,
        status: "pending_payment",
        created_at: "2026-03-23T00:00:00Z",
        updated_at: "2026-03-23T00:00:00Z",
      },
      checkout_url: "https://checkout.example.com/session",
      job: { id: "job-1" },
    } as unknown as Awaited<ReturnType<typeof api.createTenant>>;
  };

  const business = await submitTenantOnboarding({
    subdomain: "alpha",
    companyName: "Alpha Ltd",
    plan: "business",
    chosenApp: "crm",
  });
  const starter = await submitTenantOnboarding({
    subdomain: "beta",
    companyName: "Beta Ltd",
    plan: "starter",
    chosenApp: "erpnext",
  });

  assert.equal(captured.length, 2);
  assert.equal(captured[0]?.chosen_app, "crm");
  assert.equal("chosen_app" in (captured[1] ?? {}), false);
  assert.equal(business.step, "payment");
  assert.equal(starter.step, "payment");
  assert.equal(business.jobId, "job-1");
});

test("loadWorkspaceReadiness preserves optional endpoint support shape", async () => {
  api.getTenantReadiness = async () => ({ supported: false, data: null });
  const unsupported = await loadWorkspaceReadiness("tenant-1");
  assert.equal(unsupported.supported, false);

  api.getTenantReadiness = async () => ({
    supported: true,
    data: { ready: true, message: "ok" },
  });
  const supported = await loadWorkspaceReadiness("tenant-1");
  assert.equal(supported.supported, true);
  if (!supported.supported) {
    throw new Error("Expected supported readiness response.");
  }
  assert.equal(supported.data.ready, true);
});

test("restorePersistedTenant maps payment success to success step", async () => {
  api.getTenant = async () =>
    ({
      id: "tenant-success",
      owner_id: "owner-1",
      subdomain: "alpha",
      domain: "alpha.example.com",
      site_name: "alpha",
      company_name: "Alpha Ltd",
      plan: "business",
      chosen_app: "crm",
      status: "active",
      created_at: "2026-03-23T00:00:00Z",
      updated_at: "2026-03-23T00:00:00Z",
    }) as Awaited<ReturnType<typeof api.getTenant>>;

  const restored = await restorePersistedTenant("tenant-success", "https://checkout.example.com/session");
  assert.equal(restored.step, "success");
  assert.equal(restored.progress, 100);
  assert.ok(restored.tenant);
  assert.equal(restored.tenant.status, "active");
});

test("restorePersistedTenant maps failed payment resume experience to waiting step", async () => {
  api.getTenant = async () =>
    ({
      id: "tenant-failed",
      owner_id: "owner-1",
      subdomain: "beta",
      domain: "beta.example.com",
      site_name: "beta",
      company_name: "Beta Ltd",
      plan: "starter",
      chosen_app: null,
      status: "failed",
      created_at: "2026-03-23T00:00:00Z",
      updated_at: "2026-03-23T00:00:00Z",
    }) as Awaited<ReturnType<typeof api.getTenant>>;

  const restored = await restorePersistedTenant("tenant-failed", null);
  assert.equal(restored.step, "waiting");
  assert.equal(restored.progress, 100);
  assert.ok(restored.tenant);
  assert.equal(restored.tenant.status, "failed");
});
