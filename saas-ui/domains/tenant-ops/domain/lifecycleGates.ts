import type { Tenant } from "../../shared/lib/types";
import { billingBlockedActionReason, isTenantBillingBlockedStatus } from "../../shared/lib/tenantBillingGate";

export function isTenantBillingBlocked(tenant?: Pick<Tenant, "status" | "billing_status"> | null): boolean {
  return isTenantBillingBlockedStatus(tenant);
}

export function blockedActionReason(action: string): string {
  return billingBlockedActionReason(action);
}
