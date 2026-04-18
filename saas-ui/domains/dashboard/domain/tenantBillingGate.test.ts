import test from "node:test";
import assert from "node:assert/strict";

import { blockedActionReasonFromOperations, isTenantBillingBlockedFromOperations } from "./tenantBillingGate";

test("isTenantBillingBlockedFromOperations returns true for billing-blocked tenant statuses", () => {
  assert.equal(isTenantBillingBlockedFromOperations({ status: "pending_payment", billing_status: "paid" }), true);
  assert.equal(isTenantBillingBlockedFromOperations({ status: "suspended_billing", billing_status: "paid" }), true);
});

test("isTenantBillingBlockedFromOperations returns true for delinquent billing statuses", () => {
  assert.equal(isTenantBillingBlockedFromOperations({ status: "active", billing_status: "past_due" }), true);
  assert.equal(isTenantBillingBlockedFromOperations({ status: "active", billing_status: "failed" }), true);
});

test("isTenantBillingBlockedFromOperations returns false for paid active tenants", () => {
  assert.equal(isTenantBillingBlockedFromOperations({ status: "active", billing_status: "paid" }), false);
  assert.equal(isTenantBillingBlockedFromOperations({ status: "provisioning", billing_status: undefined }), false);
});

test("blockedActionReasonFromOperations reuses shared billing-block copy", () => {
  assert.equal(
    blockedActionReasonFromOperations("Backup and credential reset actions"),
    "Backup and credential reset actions is unavailable while billing is not in good standing. Restore payment first."
  );
});
