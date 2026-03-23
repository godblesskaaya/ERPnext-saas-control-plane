import { api } from "../../shared/lib/api";
import type { Job, MessageResponse, OptionalEndpointResult, Tenant } from "../../shared/lib/types";

export type ApiHealth = {
  status?: string;
  service?: string;
  checks?: Record<string, string>;
};

export async function fetchApiHealth(): Promise<{ health: ApiHealth | null; available: boolean }> {
  const response = await fetch("/api/health", { cache: "no-store" });
  if (!response.ok) {
    return { health: null, available: false };
  }
  const data = (await response.json()) as ApiHealth;
  return { health: data, available: true };
}

export async function fetchAdminJobs(limit = 80): Promise<OptionalEndpointResult<Job[]>> {
  return api.listAdminJobs(limit);
}

export async function fetchTenantList(): Promise<Tenant[]> {
  return api.listTenants();
}

export async function fetchAuthHealth(): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.authHealth();
}

export async function fetchBillingHealth(): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.billingHealth();
}

export async function rebuildAssets(): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.rebuildPlatformAssets();
}

export async function syncTenantTls(primeCerts: boolean): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.syncTenantTLS(primeCerts);
}
