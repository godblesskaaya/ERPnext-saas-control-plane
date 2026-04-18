import type { Tenant } from "../../shared/lib/types";
import { isTenantBillingBlockedStatus } from "../../shared/lib/tenantBillingGate";

export function isTenantBillingBlockedFromOperations(tenant: Pick<Tenant, "status" | "billing_status">): boolean {
  return isTenantBillingBlockedStatus(tenant);
}
