import type { Tenant } from "./types";

const BILLING_BLOCKED_STATUSES = new Set(["pending_payment", "suspended_billing"]);
const BILLING_DELINQUENT_STATUSES = new Set(["past_due", "failed", "unpaid", "cancelled", "paused", "pending"]);

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isTenantBillingBlockedStatus(tenant?: Pick<Tenant, "status" | "billing_status"> | null): boolean {
  if (!tenant) return false;
  const tenantStatus = normalize(tenant.status);
  if (BILLING_BLOCKED_STATUSES.has(tenantStatus)) {
    return true;
  }
  const billingStatus = normalize(tenant.billing_status);
  return BILLING_DELINQUENT_STATUSES.has(billingStatus);
}

export function billingBlockedActionReason(action: string): string {
  return `${action} is unavailable while billing is not in good standing. Restore payment first.`;
}
