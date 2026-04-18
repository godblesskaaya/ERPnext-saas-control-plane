import assert from "node:assert/strict";
import test from "node:test";

import { blockedActionReason, isTenantBillingBlocked } from "./lifecycleGates";

test("isTenantBillingBlocked returns true for billing-blocked tenant statuses", () => {
  assert.equal(isTenantBillingBlocked({ status: "pending_payment", billing_status: "paid" }), true);
  assert.equal(isTenantBillingBlocked({ status: "suspended_billing", billing_status: "paid" }), true);
});

test("isTenantBillingBlocked returns true for delinquent billing statuses", () => {
  assert.equal(isTenantBillingBlocked({ status: "active", billing_status: "past_due" }), true);
  assert.equal(isTenantBillingBlocked({ status: "active", billing_status: "failed" }), true);
  assert.equal(isTenantBillingBlocked({ status: "active", billing_status: "paused" }), true);
});

test("isTenantBillingBlocked returns false for paid active tenant", () => {
  assert.equal(isTenantBillingBlocked({ status: "active", billing_status: "paid" }), false);
});

test("blockedActionReason returns operator-friendly copy", () => {
  assert.match(blockedActionReason("Custom domain updates"), /billing is not in good standing/i);
});
