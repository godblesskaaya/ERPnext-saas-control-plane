import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  createWorkspaceTenant,
  loadWorkspaceBillingPortal,
  loadWorkspaceCurrentUserProfile,
  loadWorkspaceQueueData,
  onWorkspaceSessionExpired,
  queueWorkspaceBackup,
  queueWorkspaceTenantDelete,
  resendWorkspaceVerificationEmail,
  resetWorkspaceTenantAdminPassword,
  retryWorkspaceProvisioning,
  updateWorkspaceTenantPlan,
} from "./workspaceQueueUseCases";
import { api } from "../../shared/lib/api";

const originalApi = {
  backupTenant: api.backupTenant,
  createTenant: api.createTenant,
  deleteTenant: api.deleteTenant,
  getCurrentUser: api.getCurrentUser,
  getBillingPortal: api.getBillingPortal,
  listTenants: api.listTenants,
  listTenantsPaged: api.listTenantsPaged,
  resendVerification: api.resendVerification,
  resetAdminPassword: api.resetAdminPassword,
  retryTenant: api.retryTenant,
  updateTenant: api.updateTenant,
};

afterEach(() => {
  api.backupTenant = originalApi.backupTenant;
  api.createTenant = originalApi.createTenant;
  api.deleteTenant = originalApi.deleteTenant;
  api.getCurrentUser = originalApi.getCurrentUser;
  api.getBillingPortal = originalApi.getBillingPortal;
  api.listTenants = originalApi.listTenants;
  api.listTenantsPaged = originalApi.listTenantsPaged;
  api.resendVerification = originalApi.resendVerification;
  api.resetAdminPassword = originalApi.resetAdminPassword;
  api.retryTenant = originalApi.retryTenant;
  api.updateTenant = originalApi.updateTenant;
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

test("workspace action wrappers proxy create/retry/update/portal without page-level API coupling", async () => {
  api.createTenant = async (payload) => ({
    tenant: {
      id: "t-3",
      owner_id: "u-1",
      subdomain: payload.subdomain,
      domain: `${payload.subdomain}.example.com`,
      site_name: payload.subdomain,
      company_name: payload.company_name,
      plan: payload.plan,
      chosen_app: payload.chosen_app ?? null,
      status: "pending",
      created_at: "2026-03-23T00:00:00Z",
      updated_at: "2026-03-23T00:00:00Z",
    },
    job: null,
    checkout_url: "https://pay.example.com/checkout",
  });
  api.retryTenant = async () => ({
    supported: true,
    data: {
      id: "job-1",
      tenant_id: "t-3",
      type: "provision_tenant",
      status: "queued",
      logs: "",
    },
  });
  api.updateTenant = async (_id, payload) => ({
    supported: true,
    data: {
      id: "t-3",
      owner_id: "u-1",
      subdomain: "gamma",
      domain: "gamma.example.com",
      site_name: "gamma",
      company_name: "Gamma",
      plan: payload.plan ?? "starter",
      chosen_app: payload.chosen_app ?? null,
      status: "active",
      created_at: "2026-03-23T00:00:00Z",
      updated_at: "2026-03-23T00:00:00Z",
    },
  });
  api.getBillingPortal = async () => ({ supported: true, data: { url: "https://billing.example.com" } });

  const created = await createWorkspaceTenant({
    subdomain: "gamma",
    company_name: "Gamma",
    plan: "business",
    chosen_app: "crm",
  });
  const retried = await retryWorkspaceProvisioning("t-3");
  const updated = await updateWorkspaceTenantPlan("t-3", { plan: "enterprise" });
  const portal = await loadWorkspaceBillingPortal();

  assert.equal(created.tenant.id, "t-3");
  assert.equal(retried.supported, true);
  assert.equal(updated.supported, true);
  assert.equal(portal.supported, true);
  assert.equal(portal.data?.url, "https://billing.example.com");
});

test("workspace action wrappers handle unsupported endpoint contracts", async () => {
  api.retryTenant = async () => ({ supported: false, data: null });
  api.updateTenant = async () => ({ supported: false, data: null });
  api.getBillingPortal = async () => ({ supported: false, data: null });

  const retry = await retryWorkspaceProvisioning("t-1");
  const update = await updateWorkspaceTenantPlan("t-1", { plan: "starter" });
  const portal = await loadWorkspaceBillingPortal();

  assert.equal(retry.supported, false);
  assert.equal(update.supported, false);
  assert.equal(portal.supported, false);
});

test("workspace side-effect wrappers map backup/delete/reset/resend/session subscriptions", async () => {
  let subscribed = false;
  api.resendVerification = async () => ({ message: "sent" });
  api.backupTenant = async (tenantId) => ({
    id: "job-backup",
    tenant_id: tenantId,
    type: "backup_tenant",
    status: "queued",
    logs: "",
  });
  api.resetAdminPassword = async (tenantId) => ({
    tenant_id: tenantId,
    domain: "tenant.example.com",
    administrator_user: "Administrator",
    admin_password: "secret",
    message: "ok",
  });
  api.deleteTenant = async (tenantId) => ({
    id: "job-delete",
    tenant_id: tenantId,
    type: "delete_tenant",
    status: "queued",
    logs: "",
  });

  const resend = await resendWorkspaceVerificationEmail();
  const backup = await queueWorkspaceBackup("tenant-1");
  const reset = await resetWorkspaceTenantAdminPassword("tenant-1", "pass");
  const deletion = await queueWorkspaceTenantDelete("tenant-1");
  const unsubscribe = onWorkspaceSessionExpired(() => {
    subscribed = true;
  });
  unsubscribe();
  assert.equal(typeof unsubscribe, "function");
  assert.equal(resend.message, "sent");
  assert.equal(backup.id, "job-backup");
  assert.equal(reset.tenant_id, "tenant-1");
  assert.equal(deletion.id, "job-delete");
  assert.equal(subscribed, false);
});
