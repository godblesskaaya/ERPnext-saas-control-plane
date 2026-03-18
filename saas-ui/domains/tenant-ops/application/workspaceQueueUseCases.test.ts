import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { loadWorkspaceCurrentUserProfile, loadWorkspaceQueueData } from "./workspaceQueueUseCases";
import { api } from "../../shared/lib/api";

const originalApi = {
  getCurrentUser: api.getCurrentUser,
  listTenants: api.listTenants,
  listTenantsPaged: api.listTenantsPaged,
};

afterEach(() => {
  api.getCurrentUser = originalApi.getCurrentUser;
  api.listTenants = originalApi.listTenants;
  api.listTenantsPaged = originalApi.listTenantsPaged;
});

test("loadWorkspaceQueueData uses paged backend result when supported", async () => {
  let capturedStatus: string | string[] | undefined;
  let capturedSearch: string | undefined;
  let capturedPlan: string | undefined;

  api.listTenantsPaged = async (_page, _limit, status, search, plan) => {
    capturedStatus = status;
    capturedSearch = search;
    capturedPlan = plan;
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
            company_name: "Alpha Ltd",
            plan: "business",
            status: "active",
            created_at: "2026-03-18T00:00:00Z",
            updated_at: "2026-03-18T00:00:00Z",
          },
        ],
        total: 1,
        page: 2,
        limit: 20,
      },
    };
  };

  const result = await loadWorkspaceQueueData({
    page: 2,
    limit: 20,
    showStatusFilter: true,
    statusFilter: ["pending"],
    statusFilterValue: "failed",
    search: " alpha ",
    planFilter: "business",
  });

  assert.equal(capturedStatus, "failed");
  assert.equal(capturedSearch, "alpha");
  assert.equal(capturedPlan, "business");
  assert.equal(result.usingServerPagination, true);
  assert.equal(result.page, 2);
  assert.equal(result.total, 1);
  assert.equal(result.tenants[0]?.id, "t-1");
});

test("loadWorkspaceQueueData falls back to full list when paged endpoint is unsupported", async () => {
  let capturedStatus: string | string[] | undefined;

  api.listTenantsPaged = async (_page, _limit, status) => {
    capturedStatus = status;
    return { supported: false, data: null };
  };
  api.listTenants = async () => [
    {
      id: "t-2",
      owner_id: "u-2",
      subdomain: "beta",
      domain: "beta.example.com",
      site_name: "beta",
      company_name: "Beta LLC",
      plan: "starter",
      status: "pending",
      created_at: "2026-03-18T00:00:00Z",
      updated_at: "2026-03-18T00:00:00Z",
    },
  ];

  const result = await loadWorkspaceQueueData({
    page: 1,
    limit: 20,
    showStatusFilter: false,
    statusFilter: ["pending", "provisioning"],
    statusFilterValue: "all",
    search: "",
    planFilter: "all",
  });

  assert.deepEqual(capturedStatus, ["pending", "provisioning"]);
  assert.equal(result.usingServerPagination, false);
  assert.equal(result.page, 1);
  assert.equal(result.total, 1);
  assert.equal(result.tenants[0]?.id, "t-2");
});

test("loadWorkspaceCurrentUserProfile returns repository profile", async () => {
  api.getCurrentUser = async () => ({
    id: "u-9",
    email: "owner@example.com",
    role: "owner",
    email_verified: true,
    created_at: "2026-03-18T00:00:00Z",
  });

  const user = await loadWorkspaceCurrentUserProfile();
  assert.equal(user.id, "u-9");
  assert.equal(user.email_verified, true);
});
