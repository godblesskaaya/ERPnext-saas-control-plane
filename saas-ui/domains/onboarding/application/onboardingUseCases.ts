import type { OptionalEndpointResult, SubdomainAvailability, TenantReadiness } from "../../shared/lib/types";
import type { OnboardingStep, PersistedOnboardingState, TenantRecord } from "../domain/onboardingFlow";
import {
  buildInvalidSubdomainAvailability,
  deriveStepFromTenant,
  isOnboardingStep,
  normalizeTenantCreateResponse,
  normalizeTenantStatus,
  progressForStatus,
} from "../domain/onboardingFlow";
import {
  checkSubdomainAvailability,
  createTenantCheckout,
  fetchCurrentUser,
  fetchTenant,
  fetchTenantReadiness,
  renewTenantCheckout,
  resendVerificationEmail,
  retryTenantProvisioning,
} from "../infrastructure/onboardingRepository";

export type RestoredOnboardingState = {
  tenant: TenantRecord | null;
  step: OnboardingStep;
  progress: number;
};

export type SubmitTenantOnboardingInput = {
  subdomain: string;
  companyName: string;
  plan: string;
  chosenApp: string;
};

export type SubmitTenantOnboardingResult = {
  tenant: TenantRecord;
  checkoutUrl: string | null;
  step: OnboardingStep;
  progress: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function restorePersistedTenant(tenantId: string, checkoutUrl: string | null): Promise<RestoredOnboardingState> {
  const tenant = await fetchTenant(tenantId);

  return {
    tenant,
    step: deriveStepFromTenant(tenant, checkoutUrl),
    progress: progressForStatus(tenant.status),
  };
}

export function parsePersistedOnboardingState(raw: string | null): PersistedOnboardingState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;

    const maybeStep = toStringValue(parsed.step, "details");

    return {
      step: isOnboardingStep(maybeStep) ? maybeStep : "details",
      subdomain: toStringValue(parsed.subdomain),
      companyName: toStringValue(parsed.companyName),
      plan: toStringValue(parsed.plan, "starter"),
      chosenApp: toStringValue(parsed.chosenApp, "erpnext"),
      tenantId: toNullableString(parsed.tenantId),
      checkoutUrl: toNullableString(parsed.checkoutUrl),
    };
  } catch {
    return null;
  }
}

export async function validateSubdomain(cleanSubdomain: string): Promise<SubdomainAvailability> {
  if (!cleanSubdomain) {
    return buildInvalidSubdomainAvailability(cleanSubdomain, "Enter a subdomain to verify availability.");
  }
  if (cleanSubdomain.length < 3) {
    return buildInvalidSubdomainAvailability(cleanSubdomain, "Subdomain must be at least 3 characters.");
  }

  try {
    const availability = await checkSubdomainAvailability(cleanSubdomain);
    return {
      ...availability,
      subdomain: availability.subdomain || cleanSubdomain,
      domain: availability.domain ?? null,
      message:
        availability.message ||
        (availability.available ? "Subdomain is available." : "Subdomain is unavailable. Please choose another one."),
    };
  } catch (err) {
    return buildInvalidSubdomainAvailability(
      cleanSubdomain,
      err instanceof Error ? err.message : "Could not validate subdomain"
    );
  }
}

export async function submitTenantOnboarding(input: SubmitTenantOnboardingInput): Promise<SubmitTenantOnboardingResult> {
  const shouldIncludeChosenApp = input.plan.toLowerCase() === "business";

  const payload = await createTenantCheckout({
    subdomain: input.subdomain,
    company_name: input.companyName.trim(),
    plan: input.plan,
    ...(shouldIncludeChosenApp ? { chosen_app: input.chosenApp } : {}),
  });

  const response = normalizeTenantCreateResponse(payload);
  const checkoutUrl = response.checkout_url ?? null;
  const derivedStep = deriveStepFromTenant(response.tenant, checkoutUrl);

  return {
    tenant: response.tenant,
    checkoutUrl,
    step: derivedStep === "details" ? (checkoutUrl ? "payment" : "waiting") : derivedStep,
    progress: progressForStatus(normalizeTenantStatus(response.tenant.status)),
  };
}

export async function loadCurrentUserProfile() {
  return fetchCurrentUser();
}

export async function sendVerificationEmailAgain() {
  return resendVerificationEmail();
}

export async function renewCheckoutLink(tenantId: string) {
  return renewTenantCheckout(tenantId);
}

export async function retryProvisioning(tenantId: string) {
  return retryTenantProvisioning(tenantId);
}

export async function loadTenantStatus(tenantId: string) {
  const tenant = await fetchTenant(tenantId);
  const status = normalizeTenantStatus(tenant.status);

  return {
    tenant,
    status,
    progress: progressForStatus(status),
  };
}

export async function loadWorkspaceReadiness(tenantId: string): Promise<OptionalEndpointResult<TenantReadiness>> {
  return fetchTenantReadiness(tenantId);
}
