import { getApiErrorMessage, isSessionExpiredError } from "../../shared/lib/api";
import type {
  BackupManifestEntry,
  DomainMapping,
  Job,
  OptionalEndpointResult,
  ResetAdminPasswordResult,
  SupportNote,
  Tenant,
  TenantCreateResponse,
  TenantMember,
  TenantSubscription,
  TenantSummary,
  UserProfile,
} from "../../shared/lib/types";
import {
  createTenantDomainMapping,
  createTenantSupportNoteRecord,
  deleteTenantDomainMapping,
  enqueueTenantBackup,
  enqueueTenantDelete,
  fetchCurrentUserProfile,
  fetchTenantAuditLog,
  fetchTenantBackups,
  fetchTenantById,
  fetchTenantDomains,
  fetchTenantJobs,
  fetchTenantMembers,
  fetchTenantSubscription,
  fetchTenantSummary,
  fetchTenantSupportNotes,
  inviteTenantWorkspaceMember,
  renewTenantCheckoutLink,
  resetTenantAdminPassword,
  removeTenantWorkspaceMember,
  restoreTenantByBackup,
  retryTenantById,
  suspendTenantWorkspace,
  unsuspendTenantWorkspace,
  updateTenantSupportNoteRecord,
  updateTenantWorkspace,
  updateTenantWorkspaceMemberRole,
  verifyTenantDomainMapping,
} from "../infrastructure/tenantRepository";

export async function loadTenantDetail(tenantId: string): Promise<Tenant> {
  return fetchTenantById(tenantId);
}

export async function loadTenantCurrentUser(): Promise<UserProfile> {
  return fetchCurrentUserProfile();
}

export async function retryTenantProvisioningAction(tenantId: string): Promise<OptionalEndpointResult<Job>> {
  return retryTenantById(tenantId);
}

export async function loadTenantBackupManifest(
  tenantId: string
): Promise<OptionalEndpointResult<BackupManifestEntry[]>> {
  return fetchTenantBackups(tenantId);
}

export async function queueTenantBackupJob(tenantId: string): Promise<Job> {
  return enqueueTenantBackup(tenantId);
}

export async function resetTenantAdministratorPassword(
  tenantId: string,
  newPassword?: string
): Promise<ResetAdminPasswordResult> {
  return resetTenantAdminPassword(tenantId, newPassword);
}

export async function queueTenantDeleteJob(tenantId: string): Promise<Job> {
  return enqueueTenantDelete(tenantId);
}

export async function updateTenantPlanDetails(
  tenantId: string,
  payload: { plan: string; chosen_app?: string }
): Promise<OptionalEndpointResult<Tenant>> {
  return updateTenantWorkspace(tenantId, payload);
}

export async function loadTenantAuditEvents(tenantId: string, page = 1, limit = 50) {
  return fetchTenantAuditLog(tenantId, page, limit);
}

export async function loadTenantMembers(tenantId: string): Promise<OptionalEndpointResult<TenantMember[]>> {
  return fetchTenantMembers(tenantId);
}

export async function loadTenantDomains(tenantId: string): Promise<OptionalEndpointResult<DomainMapping[]>> {
  return fetchTenantDomains(tenantId);
}

export async function createTenantDomain(tenantId: string, domain: string) {
  return createTenantDomainMapping(tenantId, domain);
}

export async function verifyTenantDomain(tenantId: string, mappingId: string, token?: string | null) {
  return verifyTenantDomainMapping(tenantId, mappingId, token);
}

export async function deleteTenantDomain(tenantId: string, mappingId: string) {
  return deleteTenantDomainMapping(tenantId, mappingId);
}

export async function inviteTenantMember(tenantId: string, payload: { email: string; role: string }) {
  return inviteTenantWorkspaceMember(tenantId, payload);
}

export async function updateTenantMemberRole(tenantId: string, memberId: string, role: string) {
  return updateTenantWorkspaceMemberRole(tenantId, memberId, role);
}

export async function removeTenantMember(tenantId: string, memberId: string) {
  return removeTenantWorkspaceMember(tenantId, memberId);
}

export async function loadTenantSupportNotes(tenantId: string): Promise<OptionalEndpointResult<SupportNote[]>> {
  return fetchTenantSupportNotes(tenantId);
}

export async function createTenantSupportNote(
  tenantId: string,
  category: string,
  note: string,
  extras?: { owner_name?: string; owner_contact?: string; sla_due_at?: string; status?: string }
) {
  return createTenantSupportNoteRecord(tenantId, category, note, extras);
}

export async function updateTenantSupportNote(noteId: string, payload: Partial<SupportNote>) {
  return updateTenantSupportNoteRecord(noteId, payload);
}

export async function loadTenantRecentJobs(
  tenantId: string,
  limit = 40,
  maxItems = 5
): Promise<{ supported: boolean; data: Job[] }> {
  const result = await fetchTenantJobs(limit);
  if (!result.supported) {
    return { supported: false, data: [] };
  }

  const jobs = (result.data ?? []).filter((job) => job.tenant_id === tenantId).slice(0, maxItems);
  return { supported: true, data: jobs };
}

export async function loadTenantSummary(tenantId: string): Promise<OptionalEndpointResult<TenantSummary>> {
  return fetchTenantSummary(tenantId);
}

export async function loadTenantSubscription(tenantId: string): Promise<OptionalEndpointResult<TenantSubscription>> {
  return fetchTenantSubscription(tenantId);
}

export async function restoreTenantFromBackup(tenantId: string, backupId: string): Promise<OptionalEndpointResult<Job>> {
  return restoreTenantByBackup(tenantId, backupId);
}

export async function suspendTenantAccess(tenantId: string, reason?: string) {
  return suspendTenantWorkspace(tenantId, reason);
}

export async function unsuspendTenantAccess(tenantId: string, reason?: string) {
  return unsuspendTenantWorkspace(tenantId, reason);
}

export async function renewTenantCheckout(tenantId: string): Promise<OptionalEndpointResult<TenantCreateResponse>> {
  return renewTenantCheckoutLink(tenantId);
}

export function isTenantDetailSessionExpired(error: unknown): boolean {
  return isSessionExpiredError(error);
}

export function toTenantDetailErrorMessage(error: unknown, fallback: string): string {
  return getApiErrorMessage(error, fallback);
}
