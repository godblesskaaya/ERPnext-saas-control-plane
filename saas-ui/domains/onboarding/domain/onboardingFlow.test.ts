import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveStepFromTenant,
  normalizeTenantCreateResponse,
  normalizeTenantStatus,
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

test("normalizeTenantCreateResponse wraps tenant record payloads", () => {
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
});
