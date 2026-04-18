import type { Tenant } from "../../shared/lib/types";

const BILLING_BLOCKED_STATUSES = new Set(["pending_payment", "suspended_billing"]);
const BILLING_DELINQUENT_VALUES = new Set(["past_due", "failed", "unpaid", "cancelled", "paused", "pending"]);

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isTenantBillingBlockedFromOperations(tenant: Pick<Tenant, "status" | "billing_status">): boolean {
  const tenantStatus = normalize(tenant.status);
  if (BILLING_BLOCKED_STATUSES.has(tenantStatus)) {
    return true;
  }

  const billingStatus = normalize(tenant.billing_status);
  return BILLING_DELINQUENT_VALUES.has(billingStatus);
}

