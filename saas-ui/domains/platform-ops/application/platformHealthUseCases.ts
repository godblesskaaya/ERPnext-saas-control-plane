import { getApiErrorMessage } from "../../shared/lib/api";
import type { Job, Tenant } from "../../shared/lib/types";
import {
  fetchAdminJobs,
  fetchApiHealth,
  fetchAuthHealth,
  fetchBillingHealth,
  fetchTenantList,
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
};

export async function loadPlatformHealthSnapshot(): Promise<PlatformHealthSnapshot> {
  const [{ health, available }, jobsResult, tenantList, authResult, billingResult] = await Promise.all([
    fetchApiHealth(),
    fetchAdminJobs(80),
    fetchTenantList(),
    fetchAuthHealth(),
    fetchBillingHealth(),
  ]);

  return {
    health,
    healthAvailable: available,
    jobs: jobsResult.supported ? (jobsResult.data ?? []) : [],
    tenants: tenantList,
    authHealth: authResult.supported ? (authResult.data.message ?? "ok") : "unsupported",
    billingHealth: billingResult.supported ? (billingResult.data.message ?? "ok") : "unsupported",
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
