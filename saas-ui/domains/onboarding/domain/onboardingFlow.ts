import type {
  SubdomainAvailability,
  Tenant,
  TenantCreateResponse as ApiTenantCreateResponse,
  TenantStatus,
} from "../../shared/lib/types";

export type OnboardingStep = "details" | "plan" | "payment" | "waiting" | "success";

export const onboardingFlow = ["details", "plan", "payment", "waiting", "success"] as const;

const ONBOARDING_WAITING_STATUSES = new Set<string>([
  "pending",
  "provisioning",
  "failed",
  "upgrading",
  "restoring",
  "deleting",
  "pending_deletion",
  "suspended",
  "suspended_admin",
  "suspended_billing",
  "deleted",
]);

const TERMINAL_STATUSES = [
  "active",
  "failed",
  "deleted",
  "suspended",
  "suspended_admin",
  "suspended_billing",
  "pending_deletion",
] as const;

const TENANT_RECORD_FIELDS = ["id", "subdomain", "domain", "company_name", "plan", "chosen_app", "status"] as const;
type TenantRecordField = (typeof TENANT_RECORD_FIELDS)[number];

export type TenantRecord = Pick<Tenant, TenantRecordField>;

export type TenantCreateResponse = Pick<ApiTenantCreateResponse, "checkout_url"> & {
  tenant: TenantRecord;
};

export type PersistedOnboardingState = {
  step: OnboardingStep;
  subdomain: string;
  companyName: string;
  plan: string;
  chosenApp: string;
  tenantId: string | null;
  checkoutUrl: string | null;
};

export const flowLabels: Record<OnboardingStep, string> = {
  details: "1. Business details",
  plan: "2. Choose operating level",
  payment: "3. Confirm payment",
  waiting: "4. Provisioning",
  success: "5. Go live",
};

export const TERMINAL_TENANT_STATUSES: ReadonlySet<string> = new Set<string>(TERMINAL_STATUSES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function isOnboardingStep(value: string): value is OnboardingStep {
  return (onboardingFlow as readonly string[]).includes(value);
}

export function normalizeTenantStatus(status: TenantStatus | string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

export function isTenantRecord(value: unknown): value is TenantRecord {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.subdomain === "string" &&
    typeof value.domain === "string" &&
    typeof value.company_name === "string" &&
    typeof value.plan === "string" &&
    typeof value.status === "string" &&
    (value.chosen_app === undefined || value.chosen_app === null || typeof value.chosen_app === "string")
  );
}

export function isTenantCreateResponse(value: unknown): value is TenantCreateResponse {
  if (!isRecord(value)) return false;
  return isTenantRecord(value.tenant);
}

export function normalizeTenantCreateResponse(payload: TenantCreateResponse | TenantRecord): TenantCreateResponse {
  if (isTenantCreateResponse(payload)) {
    return {
      ...payload,
      checkout_url: stringOrNull(payload.checkout_url),
    };
  }

  return {
    tenant: payload,
    checkout_url: null,
  };
}

export function sanitizeSubdomain(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function progressForStatus(status: TenantStatus | string | null | undefined): number {
  const normalized = normalizeTenantStatus(status);

  switch (normalized) {
    case "pending_payment":
      return 20;
    case "pending":
      return 45;
    case "provisioning":
      return 75;
    case "upgrading":
    case "restoring":
      return 90;
    case "active":
    case "failed":
    case "pending_deletion":
    case "deleting":
    case "deleted":
    case "suspended":
    case "suspended_admin":
    case "suspended_billing":
      return 100;
    default:
      return 35;
  }
}

export function statusLabel(status: TenantStatus | string | null | undefined): string {
  const normalized = normalizeTenantStatus(status);

  switch (normalized) {
    case "pending_payment":
      return "Awaiting payment confirmation";
    case "pending":
      return "Queued for provisioning";
    case "provisioning":
      return "Provisioning in progress";
    case "upgrading":
      return "Upgrade in progress";
    case "restoring":
      return "Restore in progress";
    case "deleting":
      return "Deletion in progress";
    case "pending_deletion":
      return "Deletion scheduled";
    case "active":
      return "Workspace is ready";
    case "failed":
      return "Provisioning failed";
    case "suspended":
      return "Workspace suspended";
    case "suspended_admin":
      return "Workspace suspended by admin";
    case "suspended_billing":
      return "Workspace suspended for billing";
    case "deleted":
      return "Workspace deleted";
    default:
      return normalized || "Starting";
  }
}

export function deriveStepFromTenant(tenant: Pick<TenantRecord, "status">, checkoutUrl: string | null): OnboardingStep {
  const status = normalizeTenantStatus(tenant.status);

  if (status === "active") return "success";
  if (status === "pending_payment") return checkoutUrl ? "payment" : "waiting";
  if (ONBOARDING_WAITING_STATUSES.has(status)) return "waiting";

  return "details";
}

export function buildInvalidSubdomainAvailability(cleanSubdomain: string, message: string): SubdomainAvailability {
  return {
    subdomain: cleanSubdomain,
    domain: null,
    available: false,
    reason: "invalid",
    message,
  };
}
