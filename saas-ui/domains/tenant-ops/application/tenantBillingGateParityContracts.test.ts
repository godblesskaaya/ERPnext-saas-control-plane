import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { isTenantBillingBlockedFromOperations } from "../../dashboard/domain/tenantBillingGate";
import { isTenantBillingBlockedStatus } from "../../shared/lib/tenantBillingGate";
import { isTenantBillingBlocked } from "../domain/lifecycleGates";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

test("tenant billing wrappers preserve shared billing-gate parity across domains", () => {
  const samples = [
    { status: "pending_payment", billing_status: "paid" },
    { status: "suspended_billing", billing_status: "paid" },
    { status: "active", billing_status: "past_due" },
    { status: "active", billing_status: "failed" },
    { status: "active", billing_status: "paused" },
    { status: "active", billing_status: "paid" },
    { status: "provisioning", billing_status: undefined },
  ] as const;

  for (const sample of samples) {
    const expected = isTenantBillingBlockedStatus(sample);
    assert.equal(
      isTenantBillingBlockedFromOperations(sample),
      expected,
      `dashboard wrapper diverged for status=${sample.status}, billing=${sample.billing_status ?? "undefined"}`,
    );
    assert.equal(
      isTenantBillingBlocked(sample),
      expected,
      `tenant-ops wrapper diverged for status=${sample.status}, billing=${sample.billing_status ?? "undefined"}`,
    );
  }
});

test("wrapper source keeps explicit delegation to shared billing helper", () => {
  const dashboardGateSource = readSource("domains/dashboard/domain/tenantBillingGate.ts");
  const lifecycleGateSource = readSource("domains/tenant-ops/domain/lifecycleGates.ts");

  assert.equal(
    dashboardGateSource.includes("isTenantBillingBlockedStatus"),
    true,
    "dashboard wrapper should reference shared billing gate helper",
  );
  assert.equal(
    lifecycleGateSource.includes("isTenantBillingBlockedStatus"),
    true,
    "tenant-ops wrapper should reference shared billing gate helper",
  );
  assert.equal(
    dashboardGateSource.includes("return isTenantBillingBlockedStatus("),
    true,
    "dashboard wrapper missing return delegation marker",
  );
  assert.equal(
    lifecycleGateSource.includes("return isTenantBillingBlockedStatus("),
    true,
    "tenant-ops wrapper missing return delegation marker",
  );
});
