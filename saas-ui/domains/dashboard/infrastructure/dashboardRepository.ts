import { api } from "../../shared/lib/api";
import type { MessageResponse, MetricsSummary, OptionalEndpointResult } from "../../shared/lib/types";

export async function fetchDashboardMetrics(): Promise<OptionalEndpointResult<MetricsSummary>> {
  return api.getAdminMetrics();
}

export async function fetchAuthHealth(): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.authHealth();
}

export async function fetchBillingHealth(): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.billingHealth();
}
