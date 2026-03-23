import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  executeTenantLifecycleAction,
  issueSupportImpersonationLink,
  loadAdminTenantPage,
} from "./adminUseCases";
import { api } from "../../shared/lib/api";

const originalApi = {
  listAllTenants: api.listAllTenants,
  listAllTenantsPaged: api.listAllTenantsPaged,
  suspendTenant: api.suspendTenant,
  unsuspendTenant: api.unsuspendTenant,
  requestImpersonationLink: api.requestImpersonationLink,
};

afterEach(() => {
  api.listAllTenants = originalApi.listAllTenants;
  api.listAllTenantsPaged = originalApi.listAllTenantsPaged;
  api.suspendTenant = originalApi.suspendTenant;
  api.unsuspendTenant = originalApi.unsuspendTenant;
  api.requestImpersonationLink = originalApi.requestImpersonationLink;
});

test("loadAdminTenantPage uses paged endpoint when supported", async () => {
  api.listAllTenantsPaged = async (page, limit, status, search, plan) => {
    assert.equal(page, 2);
    assert.equal(limit, 25);
    assert.equal(status, "failed");
    assert.equal(search, "alpha");
    assert.equal(plan, "business");
    return {
      supported: true,
      data: {
        data: [
          {
            id: "t-1",
            owner_id: "u-1",
            subdomain: "alpha",
            domain: "alpha.example.com",
            site_name: "alpha",
            company_name: "Alpha",
            plan: "business",
            status: "failed",
            created_at: "2026-03-23T00:00:00Z",
            updated_at: "2026-03-23T00:00:00Z",
          },
        ],
        total: 1,
        page: 2,
        limit: 25,
      },
    };
  };

  const result = await loadAdminTenantPage({
    page: 2,
    limit: 25,
    status: "failed",
    search: "alpha",
    plan: "business",
  });

  assert.equal(result.usingServerPagination, true);
  assert.equal(result.total, 1);
  assert.equal(result.tenants[0]?.id, "t-1");
});

test("loadAdminTenantPage falls back to full-list endpoint", async () => {
  api.listAllTenantsPaged = async () => ({ supported: false, data: null });
  api.listAllTenants = async () => [
    {
      id: "t-2",
      owner_id: "u-2",
      subdomain: "beta",
      domain: "beta.example.com",
      site_name: "beta",
      company_name: "Beta",
      plan: "starter",
      status: "active",
      created_at: "2026-03-23T00:00:00Z",
      updated_at: "2026-03-23T00:00:00Z",
    },
  ];

  const result = await loadAdminTenantPage({ page: 1, limit: 50 });
  assert.equal(result.usingServerPagination, false);
  assert.equal(result.total, 1);
  assert.equal(result.tenants[0]?.id, "t-2");
});

test("executeTenantLifecycleAction dispatches suspend and unsuspend operations", async () => {
  let suspendCalls = 0;
  let unsuspendCalls = 0;

  api.suspendTenant = async (tenantId, reason) => {
    suspendCalls += 1;
    assert.equal(tenantId, "tenant-1");
    assert.equal(reason, "fraud-check");
    return { supported: true, data: { message: "ok" } };
  };
  api.unsuspendTenant = async (tenantId, reason) => {
    unsuspendCalls += 1;
    assert.equal(tenantId, "tenant-1");
    assert.equal(reason, "restored");
    return { supported: true, data: { message: "ok" } };
  };

  const suspended = await executeTenantLifecycleAction("suspend", "tenant-1", "fraud-check");
  const unsuspended = await executeTenantLifecycleAction("unsuspend", "tenant-1", "restored");

  assert.equal(suspended.supported, true);
  assert.equal(unsuspended.supported, true);
  assert.equal(suspendCalls, 1);
  assert.equal(unsuspendCalls, 1);
});

test("issueSupportImpersonationLink returns unsupported when endpoint is absent", async () => {
  api.requestImpersonationLink = async () => ({ supported: false, data: null });
  const result = await issueSupportImpersonationLink("owner@example.com", "support");
  assert.equal(result.supported, false);
  assert.equal(result.link, null);
});
