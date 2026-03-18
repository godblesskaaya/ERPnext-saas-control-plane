import type { Tenant } from "../../shared/lib/types";

export type BillingFollowUpSummary = {
  channelCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  billingCounts: Record<string, number>;
};

export function isBillingFollowUpCandidate(tenant: Tenant): boolean {
  return (
    ["pending_payment", "suspended_billing"].includes(tenant.status) ||
    ["failed", "past_due", "unpaid", "cancelled"].includes(tenant.billing_status ?? "")
  );
}

export function summarizeBillingFollowUps(tenants: Tenant[]): BillingFollowUpSummary {
  const channelCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  const billingCounts: Record<string, number> = {};

  tenants.filter(isBillingFollowUpCandidate).forEach((tenant) => {
    const channel = tenant.payment_channel ?? "unknown";
    channelCounts[channel] = (channelCounts[channel] ?? 0) + 1;
    statusCounts[tenant.status] = (statusCounts[tenant.status] ?? 0) + 1;
    if (tenant.billing_status) {
      billingCounts[tenant.billing_status] = (billingCounts[tenant.billing_status] ?? 0) + 1;
    }
  });

  return { channelCounts, statusCounts, billingCounts };
}
