import { api } from "../../shared/lib/api";
import type { Tenant, UserProfile } from "../../shared/lib/types";

export type TenantQueueQuery = {
  page: number;
  limit: number;
  status?: string | string[];
  search?: string;
  plan?: string;
  billingStatus?: string[];
  paymentChannel?: string[];
  filterMode?: "and" | "or";
};

export type TenantQueueData = {
  tenants: Tenant[];
  total: number;
  page: number;
  usingServerPagination: boolean;
};

export async function fetchTenants(): Promise<Tenant[]> {
  return api.listTenants();
}

export async function fetchTenantQueue(query: TenantQueueQuery): Promise<TenantQueueData> {
  const paged = await api.listTenantsPaged(
    query.page,
    query.limit,
    query.status,
    query.search,
    query.plan,
    query.billingStatus,
    query.paymentChannel,
    query.filterMode ?? "and"
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
    page: query.page,
    usingServerPagination: false,
  };
}

export async function fetchCurrentUserProfile(): Promise<UserProfile> {
  return api.getCurrentUser();
}
