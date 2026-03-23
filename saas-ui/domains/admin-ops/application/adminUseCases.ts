import type { ImpersonationLink } from "../../shared/lib/types";
import {
  fetchAdminJobLogs,
  fetchAdminJobs,
  fetchAdminMetrics,
  fetchAdminTenants,
  fetchAuditLog,
  fetchDeadLetterJobs,
  requeueDeadLetterJob,
  requestImpersonationLink,
  suspendTenant,
  unsuspendTenant,
  type AdminTenantQuery,
  downloadAuditCsv,
} from "../infrastructure/adminRepository";

export type TenantActionType = "suspend" | "unsuspend";

export async function loadAdminTenantPage(query: AdminTenantQuery) {
  return fetchAdminTenants(query);
}

export async function loadAdminDeadLetterQueue() {
  return fetchDeadLetterJobs();
}

export async function loadAdminJobs(limit = 100) {
  return fetchAdminJobs(limit);
}

export async function loadAdminJobLogs(jobId: string) {
  return fetchAdminJobLogs(jobId);
}

export async function loadAdminAuditLog(page: number, limit: number) {
  return fetchAuditLog(page, limit);
}

export async function loadAdminMetrics() {
  return fetchAdminMetrics();
}

export async function requeueDeadLetterById(jobId: string) {
  return requeueDeadLetterJob(jobId);
}

export async function executeTenantLifecycleAction(
  action: TenantActionType,
  tenantId: string,
  reason?: string
): Promise<{ supported: boolean }> {
  if (action === "suspend") {
    return suspendTenant(tenantId, reason);
  }
  return unsuspendTenant(tenantId, reason);
}

export async function exportAdminAuditCsv(limit = 500): Promise<void> {
  await downloadAuditCsv(limit);
}

export async function issueSupportImpersonationLink(
  targetEmail: string,
  reason: string
): Promise<{ supported: boolean; link: ImpersonationLink | null }> {
  return requestImpersonationLink(targetEmail, reason);
}
