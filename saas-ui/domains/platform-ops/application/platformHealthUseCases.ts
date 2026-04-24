import { getApiErrorMessage } from "../../shared/lib/api";
import type { Job, Tenant, TenantRuntimeConsistencyReport } from "../../shared/lib/types";
import {
  fetchAdminJobs,
  fetchApiHealth,
  fetchAuthHealth,
  fetchBillingHealth,
  fetchTenantList,
  fetchTenantRuntimeConsistency,
  rebuildAssets,
  syncTenantTls,
  type ApiHealth,
} from "../infrastructure/platformHealthRepository";

export type PlatformHealthSnapshot = {
  health: ApiHealth | null;
  healthAvailable: boolean;
  jobs: Job[];
  tenants: Tenant[];
  authHealth: string;
  billingHealth: string;
  tenantRuntimeConsistency: TenantRuntimeConsistencyReport | null;
};

export async function loadPlatformHealthSnapshot(): Promise<PlatformHealthSnapshot> {
  const results = await Promise.allSettled([
    fetchApiHealth(),
    fetchAdminJobs(80),
    fetchTenantList(),
    fetchAuthHealth(),
    fetchBillingHealth(),
    fetchTenantRuntimeConsistency(),
  ] as const);

  const healthResult = results[0].status === "fulfilled" ? results[0].value : { health: null, available: false };
  const jobsResult = results[1].status === "fulfilled" ? results[1].value : { supported: false, data: null };
  const tenantList = results[2].status === "fulfilled" ? results[2].value : [];
  const authResult = results[3].status === "fulfilled" ? results[3].value : { supported: false, data: null };
  const billingResult = results[4].status === "fulfilled" ? results[4].value : { supported: false, data: null };
  const consistencyResult = results[5].status === "fulfilled" ? results[5].value : { supported: false, data: null };

  return {
    health: healthResult.health,
    healthAvailable: healthResult.available,
    jobs: jobsResult.supported ? (jobsResult.data ?? []) : [],
    tenants: tenantList,
    authHealth: authResult.supported ? (authResult.data?.message ?? "ok") : "unsupported",
    billingHealth: billingResult.supported ? (billingResult.data?.message ?? "ok") : "unsupported",
    tenantRuntimeConsistency: consistencyResult.supported ? (consistencyResult.data ?? null) : null,
  };
}

export type MaintenanceAction = "assets" | "tls" | "tls-prime";

export async function runPlatformMaintenanceAction(action: MaintenanceAction): Promise<{
  supported: boolean;
  message: string;
}> {
  const result = action === "assets" ? await rebuildAssets() : await syncTenantTls(action === "tls-prime");

  if (!result.supported) {
    return {
      supported: false,
      message: "Maintenance endpoint is not enabled on this backend.",
    };
  }

  return {
    supported: true,
    message: result.data?.message ?? "Maintenance task queued.",
  };
}

export function getPlatformOpsErrorMessage(err: unknown, fallback: string): string {
  return getApiErrorMessage(err, fallback);
}
