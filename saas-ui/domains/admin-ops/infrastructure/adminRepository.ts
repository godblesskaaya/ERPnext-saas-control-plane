import { api } from "../../shared/lib/api";
import type {
  AuditLogEntry,
  DeadLetterJob,
  DunningItem,
  ImpersonationLink,
  Job,
  MetricsSummary,
  SupportNote,
  Tenant,
} from "../../shared/lib/types";

type FilterMode = "and" | "or";

export type AdminTenantQuery = {
  page: number;
  limit: number;
  status?: string | string[];
  search?: string;
  plan?: string;
  billingStatus?: string | string[];
  paymentChannel?: string | string[];
  filterMode?: FilterMode;
};

export type AdminTenantPage = {
  tenants: Tenant[];
  total: number;
  page: number;
  usingServerPagination: boolean;
};

export async function fetchAdminTenants(query: AdminTenantQuery): Promise<AdminTenantPage> {
  const paged = await api.listAllTenantsPaged(
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

  const tenants = await api.listAllTenants();
  return {
    tenants,
    total: tenants.length,
    page: query.page,
    usingServerPagination: false,
  };
}

export type OptionalListResult<T> = {
  supported: boolean;
  data: T[];
};

export async function fetchDeadLetterJobs(): Promise<OptionalListResult<DeadLetterJob>> {
  const result = await api.listDeadLetterJobs();
  if (!result.supported) {
    return { supported: false, data: [] };
  }
  return { supported: true, data: result.data };
}

export async function fetchAdminJobs(limit = 100): Promise<OptionalListResult<Job>> {
  const result = await api.listAdminJobs(limit);
  if (!result.supported) {
    return { supported: false, data: [] };
  }
  return { supported: true, data: result.data };
}

export async function fetchAdminJobLogs(jobId: string): Promise<{ supported: boolean; job: Job | null }> {
  const result = await api.getAdminJobLogs(jobId);
  if (!result.supported) {
    return { supported: false, job: null };
  }
  return { supported: true, job: result.data };
}

export type AuditLogResult = {
  supported: boolean;
  entries: AuditLogEntry[];
  total: number;
};

export async function fetchAuditLog(page = 1, limit = 50): Promise<AuditLogResult> {
  const result = await api.listAuditLog(page, limit);
  if (!result.supported) {
    return { supported: false, entries: [], total: 0 };
  }
  return {
    supported: true,
    entries: result.data.data,
    total: result.data.total,
  };
}

export async function fetchAdminMetrics(): Promise<{ supported: boolean; metrics: MetricsSummary | null }> {
  const result = await api.getAdminMetrics();
  if (!result.supported) {
    return { supported: false, metrics: null };
  }
  return { supported: true, metrics: result.data };
}

export async function fetchTenantCatalog(): Promise<Tenant[]> {
  return api.listTenants();
}

export async function fetchSupportNotesCatalog(): Promise<OptionalListResult<SupportNote>> {
  const result = await api.listSupportNotesAll();
  if (!result.supported) {
    return { supported: false, data: [] };
  }
  return { supported: true, data: result.data };
}

export async function fetchBillingDunningQueue(): Promise<OptionalListResult<DunningItem>> {
  const result = await api.listBillingDunning();
  if (!result.supported) {
    return { supported: false, data: [] };
  }
  return { supported: true, data: result.data };
}

export async function triggerBillingDunningCycle(dryRun = false): Promise<{ supported: boolean; message: string }> {
  const result = await api.runBillingDunningCycle(dryRun);
  if (!result.supported) {
    return { supported: false, message: "" };
  }
  return { supported: true, message: result.data.message || "Dunning cycle queued." };
}

export async function requeueDeadLetterJob(jobId: string): Promise<{ supported: boolean }> {
  const result = await api.requeueDeadLetterJob(jobId);
  if (!result.supported) {
    return { supported: false };
  }
  return { supported: true };
}

export async function suspendTenant(tenantId: string, reason?: string): Promise<{ supported: boolean }> {
  const result = await api.suspendTenant(tenantId, reason);
  if (!result.supported) {
    return { supported: false };
  }
  return { supported: true };
}

export async function unsuspendTenant(tenantId: string, reason?: string): Promise<{ supported: boolean }> {
  const result = await api.unsuspendTenant(tenantId, reason);
  if (!result.supported) {
    return { supported: false };
  }
  return { supported: true };
}

export async function downloadAuditCsv(limit = 500): Promise<void> {
  await api.downloadAuditLogCsv(limit);
}

export async function requestImpersonationLink(
  targetEmail: string,
  reason: string
): Promise<{ supported: boolean; link: ImpersonationLink | null }> {
  const result = await api.requestImpersonationLink(targetEmail, reason);
  if (!result.supported) {
    return { supported: false, link: null };
  }
  return { supported: true, link: result.data };
}
