import type { Tenant } from "../../shared/lib/types";

const BILLING_BLOCKED_STATUSES = new Set(["pending_payment", "suspended_billing"]);
const BILLING_DELINQUENT_STATES = new Set(["failed", "past_due", "unpaid", "cancelled", "pending"]);

export function isTenantBillingBlocked(tenant?: Pick<Tenant, "status" | "billing_status"> | null): boolean {
  if (!tenant) return false;
  const status = String(tenant.status ?? "").trim().toLowerCase();
  const billingStatus = String(tenant.billing_status ?? "").trim().toLowerCase();
  return BILLING_BLOCKED_STATUSES.has(status) || BILLING_DELINQUENT_STATES.has(billingStatus);
}

export function blockedActionReason(action: string): string {
  return `${action} is unavailable while billing is not in good standing. Restore payment first.`;
}
