import { api } from "../../shared/lib/api";
import type {
  Job,
  MessageResponse,
  OptionalEndpointResult,
  SubdomainAvailability,
  TenantCreatePayload,
  TenantReadiness,
  UserProfile,
} from "../../shared/lib/types";
import type { TenantCreateResponse, TenantRecord } from "../domain/onboardingFlow";

export type TenantCheckoutInput = TenantCreatePayload;

export async function fetchCurrentUser(): Promise<UserProfile> {
  return api.getCurrentUser();
}

export async function fetchTenant(tenantId: string): Promise<TenantRecord> {
  return api.getTenant(tenantId);
}

export async function checkSubdomainAvailability(subdomain: string): Promise<SubdomainAvailability> {
  return api.checkSubdomainAvailability(subdomain);
}

export async function createTenantCheckout(input: TenantCheckoutInput): Promise<TenantCreateResponse | TenantRecord> {
  const payload: TenantCreateResponse | TenantRecord = await api.createTenant(input);
  return payload;
}

export async function renewTenantCheckout(tenantId: string): Promise<OptionalEndpointResult<TenantCreateResponse>> {
  return api.renewCheckout(tenantId);
}

export async function retryTenantProvisioning(tenantId: string): Promise<OptionalEndpointResult<Job>> {
  return api.retryTenant(tenantId);
}

export async function resendVerificationEmail(): Promise<MessageResponse> {
  return api.resendVerification();
}

export async function fetchTenantReadiness(tenantId: string): Promise<OptionalEndpointResult<TenantReadiness>> {
  return api.getTenantReadiness(tenantId);
}
