import assert from "node:assert/strict";
import test from "node:test";

import { billingBlockedActionReason, isTenantBillingBlockedStatus } from "./tenantBillingGate";

test("isTenantBillingBlockedStatus returns true for billing-gated tenant statuses", () => {
  assert.equal(isTenantBillingBlockedStatus({ status: "pending_payment", billing_status: "paid" }), true);
  assert.equal(isTenantBillingBlockedStatus({ status: "suspended_billing", billing_status: "paid" }), true);
});

test("isTenantBillingBlockedStatus returns true for delinquent billing statuses", () => {
  assert.equal(isTenantBillingBlockedStatus({ status: "active", billing_status: "past_due" }), true);
  assert.equal(isTenantBillingBlockedStatus({ status: "active", billing_status: "failed" }), true);
  assert.equal(isTenantBillingBlockedStatus({ status: "active", billing_status: "paused" }), true);
});

test("isTenantBillingBlockedStatus returns false when billing is in good standing", () => {
  assert.equal(isTenantBillingBlockedStatus({ status: "active", billing_status: "paid" }), false);
  assert.equal(isTenantBillingBlockedStatus({ status: "provisioning", billing_status: undefined }), false);
});

test("billingBlockedActionReason returns consistent operator copy", () => {
  assert.equal(
    billingBlockedActionReason("Backup restore"),
    "Backup restore is unavailable while billing is not in good standing. Restore payment first."
  );
});
