import { api } from "../../shared/lib/api";
import type { Tenant } from "../../shared/lib/types";

type BillingFilterMode = "and" | "or";

export type LoadWorkspaceQueuePageParams = {
  page: number;
  limit: number;
  statusFilter?: string | string[];
  search?: string;
  plan?: string;
  billingFilter?: string[];
  paymentChannelFilter?: string[];
  billingFilterMode?: BillingFilterMode;
};

export type WorkspaceQueuePageResult = {
  tenants: Tenant[];
  total: number;
  page: number;
  usingServerPagination: boolean;
};

export async function loadWorkspaceQueuePage({
  page,
  limit,
  statusFilter,
  search,
  plan,
  billingFilter,
  paymentChannelFilter,
  billingFilterMode = "and",
}: LoadWorkspaceQueuePageParams): Promise<WorkspaceQueuePageResult> {
  const paged = await api.listTenantsPaged(
    page,
    limit,
    statusFilter,
    search,
    plan,
    billingFilter,
    paymentChannelFilter,
    billingFilterMode
  );

  if (paged.supported) {
    return {
      tenants: paged.data.data,
      total: paged.data.total,
      page: paged.data.page,
      usingServerPagination: true,
    };
  }

  const tenants = await api.listTenants();
  return {
    tenants,
    total: tenants.length,
    page,
    usingServerPagination: false,
  };
}
