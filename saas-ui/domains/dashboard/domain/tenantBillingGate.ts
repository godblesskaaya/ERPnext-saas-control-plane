import type { Tenant } from "../../shared/lib/types";
import { billingBlockedActionReason, isTenantBillingBlockedStatus } from "../../shared/lib/tenantBillingGate";

export function isTenantBillingBlockedFromOperations(tenant: Pick<Tenant, "status" | "billing_status">): boolean {
  return isTenantBillingBlockedStatus(tenant);
}

export function blockedActionReasonFromOperations(action: string): string {
  return billingBlockedActionReason(action);
}
