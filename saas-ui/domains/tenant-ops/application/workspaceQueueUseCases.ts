import type { Tenant, UserProfile } from "../../shared/lib/types";
import {
  applyWorkspaceQueueFallbackFilters,
  applyWorkspaceQueueSearchFallback,
  deriveWorkspaceQueueMetrics,
  type WorkspaceQueueMetrics,
} from "../domain/workspaceQueue";
import { fetchCurrentUserProfile } from "../infrastructure/tenantRepository";
import { loadWorkspaceQueuePage } from "../infrastructure/workspaceQueueRepository";

type BillingFilterMode = "and" | "or";

export type LoadWorkspaceQueueParams = {
  page: number;
  limit: number;
  showStatusFilter: boolean;
  statusFilter?: string[];
  statusFilterValue: string;
  search: string;
  planFilter: string;
  billingFilter?: string[];
  paymentChannelFilter?: string[];
  billingFilterMode?: BillingFilterMode;
};

export type WorkspaceQueueLoadResult = {
  visibleTenants: Tenant[];
  metricsTenants: Tenant[];
  total: number;
  page: number;
  usingServerPagination: boolean;
};

export function resolveWorkspaceQueueStatusFilter({
  showStatusFilter,
  statusFilter,
  statusFilterValue,
}: {
  showStatusFilter: boolean;
  statusFilter?: string[];
  statusFilterValue: string;
}): string | string[] | undefined {
  if (!showStatusFilter && statusFilter?.length) {
    return statusFilter;
  }

  if (statusFilterValue === "all") {
    return undefined;
  }

  return statusFilterValue;
}

export async function loadWorkspaceQueue(
  params: LoadWorkspaceQueueParams
): Promise<WorkspaceQueueLoadResult> {
  const {
    page,
    limit,
    showStatusFilter,
    statusFilter,
    statusFilterValue,
    search,
    planFilter,
    billingFilter,
    paymentChannelFilter,
    billingFilterMode = "and",
  } = params;

  const statusParam = resolveWorkspaceQueueStatusFilter({ showStatusFilter, statusFilter, statusFilterValue });
  const searchTerm = search.trim() || undefined;
  const fallbackStatusFilter = Array.isArray(statusParam) ? statusParam : statusParam ? [statusParam] : undefined;

  const loaded = await loadWorkspaceQueuePage({
    page,
    limit,
    statusFilter: statusParam,
    search: searchTerm,
    plan: planFilter === "all" ? undefined : planFilter,
    billingFilter,
    paymentChannelFilter,
    billingFilterMode,
  });

  if (loaded.usingServerPagination) {
    return {
      visibleTenants: loaded.tenants,
      metricsTenants: loaded.tenants,
      total: loaded.total,
      page: loaded.page,
      usingServerPagination: true,
    };
  }

  const metricsTenants = applyWorkspaceQueueFallbackFilters(loaded.tenants, {
    statusFilter: fallbackStatusFilter,
    billingFilter,
    billingFilterMode,
    paymentChannelFilter,
  });

  return {
    visibleTenants: applyWorkspaceQueueSearchFallback(metricsTenants, search),
    metricsTenants,
    total: loaded.total,
    page: loaded.page,
    usingServerPagination: false,
  };
}

export function deriveWorkspaceQueueSnapshot(tenants: Tenant[], activeJobs: number): WorkspaceQueueMetrics {
  return deriveWorkspaceQueueMetrics(tenants, activeJobs);
}

export type WorkspaceQueueDataResult = {
  tenants: Tenant[];
  total: number;
  page: number;
  usingServerPagination: boolean;
};

export async function loadWorkspaceQueueData(params: LoadWorkspaceQueueParams): Promise<WorkspaceQueueDataResult> {
  const statusParam = resolveWorkspaceQueueStatusFilter(params);
  const loaded = await loadWorkspaceQueuePage({
    page: params.page,
    limit: params.limit,
    statusFilter: statusParam,
    search: params.search.trim() || undefined,
    plan: params.planFilter === "all" ? undefined : params.planFilter,
    billingFilter: params.billingFilter,
    paymentChannelFilter: params.paymentChannelFilter,
    billingFilterMode: params.billingFilterMode ?? "and",
  });

  return {
    tenants: loaded.tenants,
    total: loaded.total,
    page: loaded.page,
    usingServerPagination: loaded.usingServerPagination,
  };
}

export async function loadWorkspaceCurrentUserProfile(): Promise<UserProfile> {
  return fetchCurrentUserProfile();
}
