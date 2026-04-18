import type { Tenant } from "../../shared/lib/types";
import { isTenantBillingBlockedStatus } from "../../shared/lib/tenantBillingGate";

export function isTenantBillingBlocked(tenant?: Pick<Tenant, "status" | "billing_status"> | null): boolean {
  return isTenantBillingBlockedStatus(tenant);
}

export function blockedActionReason(action: string): string {
  return `${action} is unavailable while billing is not in good standing. Restore payment first.`;
}
