import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveStepFromTenant,
  normalizeTenantCreateResponse,
  normalizeTenantStatus,
  progressStateLabel,
  type TenantRecord,
} from "./onboardingFlow";

test("normalizeTenantStatus trims and lowercases", () => {
  assert.equal(normalizeTenantStatus("  Pending_Payment  "), "pending_payment");
  assert.equal(normalizeTenantStatus(undefined), "");
});

test("deriveStepFromTenant maps status + checkout combinations", () => {
  assert.equal(deriveStepFromTenant({ status: "active" }, null), "success");
  assert.equal(deriveStepFromTenant({ status: "pending_payment" }, "https://checkout"), "payment");
  assert.equal(deriveStepFromTenant({ status: "pending_payment" }, null), "waiting");
  assert.equal(deriveStepFromTenant({ status: "provisioning" }, null), "waiting");
  assert.equal(deriveStepFromTenant({ status: "unknown_status" }, null), "details");
});

test("progressStateLabel prefers log-derived guidance for provisioning", () => {
  assert.equal(progressStateLabel("pending_payment"), "Waiting for payment confirmation");
  assert.equal(progressStateLabel("provisioning", "Running database migration for site"), "Applying database migrations");
  assert.equal(progressStateLabel("failed", "Installing selected apps"), "Provisioning failed while installing selected apps");
  assert.equal(progressStateLabel("active", "anything"), "Workspace is ready");
});

test("normalizeTenantCreateResponse wraps tenant record payloads and preserves job data", () => {
  const tenant: TenantRecord = {
    id: "tenant-1",
    subdomain: "demo",
    domain: "demo.example.com",
    company_name: "Demo Co",
    plan: "starter",
    chosen_app: "erpnext",
    status: "pending_payment",
  };

  const normalized = normalizeTenantCreateResponse(tenant);
  assert.equal(normalized.checkout_url, null);
  assert.deepEqual(normalized.tenant, tenant);

  const response = normalizeTenantCreateResponse({
    tenant,
    checkout_url: "https://checkout",
    job: {
      id: "job-1",
      tenant_id: "tenant-1",
      type: "provisioning",
      status: "running",
      logs: "creating site",
    },
  });

  assert.equal(response.checkout_url, "https://checkout");
  assert.equal(response.job?.id, "job-1");
});
