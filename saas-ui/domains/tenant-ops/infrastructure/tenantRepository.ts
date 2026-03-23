import { api, onSessionExpired } from "../../shared/lib/api";
import type {
  AuditLogEntry,
  BackupManifestEntry,
  BillingPortalResponse,
  DomainMapping,
  Job,
  MessageResponse,
  OptionalEndpointResult,
  PaginatedResult,
  ResetAdminPasswordResult,
  SupportNote,
  Tenant,
  TenantCreatePayload,
  TenantCreateResponse,
  TenantMember,
  TenantSubscription,
  TenantSummary,
  TenantUpdatePayload,
  UserProfile,
} from "../../shared/lib/types";

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

export async function createTenantWorkspace(payload: TenantCreatePayload): Promise<TenantCreateResponse> {
  return api.createTenant(payload);
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

export async function fetchTenantById(tenantId: string): Promise<Tenant> {
  return api.getTenant(tenantId);
}

export async function retryTenantById(tenantId: string): Promise<OptionalEndpointResult<Job>> {
  return api.retryTenant(tenantId);
}

export async function resendVerificationEmail(): Promise<MessageResponse> {
  return api.resendVerification();
}

export async function updateTenantWorkspace(
  tenantId: string,
  payload: TenantUpdatePayload
): Promise<OptionalEndpointResult<Tenant>> {
  return api.updateTenant(tenantId, payload);
}

export async function fetchWorkspaceBillingPortal(): Promise<OptionalEndpointResult<BillingPortalResponse>> {
  return api.getBillingPortal();
}

export async function enqueueTenantBackup(tenantId: string): Promise<Job> {
  return api.backupTenant(tenantId);
}

export async function resetTenantAdminPassword(
  tenantId: string,
  newPassword?: string
): Promise<ResetAdminPasswordResult> {
  return api.resetAdminPassword(tenantId, newPassword);
}

export async function enqueueTenantDelete(tenantId: string): Promise<Job> {
  return api.deleteTenant(tenantId);
}

export function subscribeWorkspaceSessionExpired(listener: () => void): () => void {
  return onSessionExpired(listener);
}

export async function fetchTenantBackups(
  tenantId: string
): Promise<OptionalEndpointResult<BackupManifestEntry[]>> {
  return api.listTenantBackups(tenantId);
}

export async function fetchTenantAuditLog(
  tenantId: string,
  page = 1,
  limit = 50
): Promise<OptionalEndpointResult<PaginatedResult<AuditLogEntry>>> {
  return api.listTenantAuditLog(tenantId, page, limit);
}

export async function fetchTenantMembers(
  tenantId: string
): Promise<OptionalEndpointResult<TenantMember[]>> {
  return api.listTenantMembers(tenantId);
}

export async function fetchTenantDomains(
  tenantId: string
): Promise<OptionalEndpointResult<DomainMapping[]>> {
  return api.listTenantDomains(tenantId);
}

export async function createTenantDomainMapping(
  tenantId: string,
  domain: string
): Promise<OptionalEndpointResult<DomainMapping>> {
  return api.createTenantDomain(tenantId, domain);
}

export async function verifyTenantDomainMapping(
  tenantId: string,
  mappingId: string,
  token?: string | null
): Promise<OptionalEndpointResult<DomainMapping>> {
  return api.verifyTenantDomain(tenantId, mappingId, token);
}

export async function deleteTenantDomainMapping(
  tenantId: string,
  mappingId: string
): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.deleteTenantDomain(tenantId, mappingId);
}

export async function inviteTenantWorkspaceMember(
  tenantId: string,
  payload: { email: string; role: string }
): Promise<OptionalEndpointResult<TenantMember>> {
  return api.inviteTenantMember(tenantId, payload);
}

export async function updateTenantWorkspaceMemberRole(
  tenantId: string,
  memberId: string,
  role: string
): Promise<OptionalEndpointResult<TenantMember>> {
  return api.updateTenantMemberRole(tenantId, memberId, role);
}

export async function removeTenantWorkspaceMember(
  tenantId: string,
  memberId: string
): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.removeTenantMember(tenantId, memberId);
}

export async function fetchTenantSupportNotes(
  tenantId: string
): Promise<OptionalEndpointResult<SupportNote[]>> {
  return api.listSupportNotes(tenantId);
}

export async function createTenantSupportNoteRecord(
  tenantId: string,
  category: string,
  note: string,
  extras?: { owner_name?: string; owner_contact?: string; sla_due_at?: string; status?: string }
): Promise<OptionalEndpointResult<SupportNote>> {
  return api.createSupportNote(tenantId, category, note, extras);
}

export async function updateTenantSupportNoteRecord(
  noteId: string,
  payload: Partial<SupportNote>
): Promise<OptionalEndpointResult<SupportNote>> {
  return api.updateSupportNote(noteId, payload);
}

export async function fetchTenantJobs(limit = 40): Promise<OptionalEndpointResult<Job[]>> {
  return api.listAdminJobs(limit);
}

export async function fetchTenantSummary(
  tenantId: string
): Promise<OptionalEndpointResult<TenantSummary>> {
  return api.getTenantSummary(tenantId);
}

export async function fetchTenantSubscription(
  tenantId: string
): Promise<OptionalEndpointResult<TenantSubscription>> {
  return api.getTenantSubscription(tenantId);
}

export async function restoreTenantByBackup(
  tenantId: string,
  backupId: string
): Promise<OptionalEndpointResult<Job>> {
  return api.restoreTenant(tenantId, backupId);
}

export async function suspendTenantWorkspace(
  tenantId: string,
  reason?: string
): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.suspendTenant(tenantId, reason);
}

export async function unsuspendTenantWorkspace(
  tenantId: string,
  reason?: string
): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.unsuspendTenant(tenantId, reason);
}
