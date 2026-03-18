import type { Tenant } from "../../shared/lib/types";

type BillingFilterMode = "and" | "or";

type WorkspaceQueueFallbackFilterOptions = {
  statusFilter?: string[];
  billingFilter?: string[];
  billingFilterMode?: BillingFilterMode;
  paymentChannelFilter?: string[];
};

export type WorkspaceQueueMetrics = {
  totalTenants: number;
  activeTenants: number;
  pendingPaymentTenants: number;
  provisioningQueueTenants: number;
  suspendedBillingTenants: number;
  provisioningTenants: number;
  failedTenants: number;
  failedBillingTenants: number;
  billingQueueCount: number;
  suspendedTenants: number;
  needsAttentionCount: number;
};

const PROVISIONING_QUEUE_STATUSES = new Set(["pending", "provisioning", "upgrading", "restoring", "pending_deletion"]);
const PROVISIONING_STATUSES = new Set(["pending", "pending_payment", "provisioning", "upgrading", "restoring", "pending_deletion"]);
const SUSPENDED_STATUSES = new Set(["suspended", "suspended_admin", "suspended_billing"]);
const BILLING_ISSUE_STATUSES = new Set(["failed", "past_due", "unpaid", "cancelled"]);

export function normalizeWorkspaceQueueValue(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function applyWorkspaceQueueFallbackFilters(
  tenants: Tenant[],
  {
    statusFilter,
    billingFilter,
    billingFilterMode = "and",
    paymentChannelFilter,
  }: WorkspaceQueueFallbackFilterOptions
): Tenant[] {
  let filtered = tenants;
  const hasStatusFilter = Boolean(statusFilter?.length);
  const hasBillingFilter = Boolean(billingFilter?.length);
  const hasChannelFilter = Boolean(paymentChannelFilter?.length);
  const allowedStatus = hasStatusFilter ? new Set(statusFilter!.map(normalizeWorkspaceQueueValue)) : null;
  const allowedBilling = hasBillingFilter ? new Set(billingFilter!.map(normalizeWorkspaceQueueValue)) : null;
  const allowedChannel = hasChannelFilter ? new Set(paymentChannelFilter!.map(normalizeWorkspaceQueueValue)) : null;

  if (hasStatusFilter && hasBillingFilter && billingFilterMode === "or") {
    return filtered.filter((tenant) => {
      const statusMatch = allowedStatus?.has(normalizeWorkspaceQueueValue(tenant.status));
      const billingMatch =
        tenant.billing_status && allowedBilling ? allowedBilling.has(normalizeWorkspaceQueueValue(tenant.billing_status)) : false;
      const channelMatch =
        tenant.payment_channel && allowedChannel ? allowedChannel.has(normalizeWorkspaceQueueValue(tenant.payment_channel)) : false;
      return statusMatch || billingMatch || channelMatch;
    });
  }

  if (hasStatusFilter && allowedStatus) {
    filtered = filtered.filter((tenant) => allowedStatus.has(normalizeWorkspaceQueueValue(tenant.status)));
  }

  if (hasBillingFilter && allowedBilling) {
    filtered = filtered.filter((tenant) =>
      tenant.billing_status ? allowedBilling.has(normalizeWorkspaceQueueValue(tenant.billing_status)) : false
    );
  }

  if (hasChannelFilter && allowedChannel) {
    filtered = filtered.filter((tenant) =>
      tenant.payment_channel ? allowedChannel.has(normalizeWorkspaceQueueValue(tenant.payment_channel)) : false
    );
  }

  return filtered;
}

export function applyWorkspaceQueueSearchFallback(tenants: Tenant[], search: string): Tenant[] {
  const term = search.trim().toLowerCase();
  if (!term) {
    return tenants;
  }

  return tenants.filter((tenant) =>
    [tenant.company_name, tenant.subdomain, tenant.domain, tenant.payment_channel].some((value) =>
      value?.toLowerCase().includes(term)
    )
  );
}

export function deriveWorkspaceQueueMetrics(tenants: Tenant[], activeJobs: number): WorkspaceQueueMetrics {
  const activeTenants = tenants.filter((tenant) => normalizeWorkspaceQueueValue(tenant.status) === "active").length;
  const pendingPaymentTenants = tenants.filter(
    (tenant) => normalizeWorkspaceQueueValue(tenant.status) === "pending_payment"
  ).length;
  const provisioningQueueTenants = tenants.filter((tenant) =>
    PROVISIONING_QUEUE_STATUSES.has(normalizeWorkspaceQueueValue(tenant.status))
  ).length;
  const suspendedBillingTenants = tenants.filter(
    (tenant) => normalizeWorkspaceQueueValue(tenant.status) === "suspended_billing"
  ).length;
  const provisioningTenants = tenants.filter((tenant) =>
    PROVISIONING_STATUSES.has(normalizeWorkspaceQueueValue(tenant.status))
  ).length;
  const failedTenants = tenants.filter((tenant) => normalizeWorkspaceQueueValue(tenant.status) === "failed").length;
  const failedBillingTenants = tenants.filter((tenant) =>
    tenant.billing_status ? BILLING_ISSUE_STATUSES.has(normalizeWorkspaceQueueValue(tenant.billing_status)) : false
  ).length;
  const billingQueueCount = pendingPaymentTenants + suspendedBillingTenants + failedBillingTenants;
  const suspendedTenants = tenants.filter((tenant) => SUSPENDED_STATUSES.has(normalizeWorkspaceQueueValue(tenant.status))).length;

  return {
    totalTenants: tenants.length,
    activeTenants,
    pendingPaymentTenants,
    provisioningQueueTenants,
    suspendedBillingTenants,
    provisioningTenants,
    failedTenants,
    failedBillingTenants,
    billingQueueCount,
    suspendedTenants,
    needsAttentionCount: provisioningTenants + failedTenants + activeJobs,
  };
}
