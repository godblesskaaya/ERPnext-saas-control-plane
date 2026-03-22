import { clearToken, getToken, saveToken } from "../../auth/auth";
import type {
  AuditLogEntry,
  BackupManifestEntry,
  PlanDetail,
  DomainMapping,
  ImpersonationLink,
  TenantMember,
  BillingPortalResponse,
  BillingInvoiceListResponse,
  MetricsSummary,
  DeadLetterJob,
  DunningItem,
  Job,
  MessageResponse,
  OptionalEndpointResult,
  PaginatedResult,
  ResetAdminPasswordResult,
  SupportNote,
  SubdomainAvailability,
  Tenant,
  TenantCreatePayload,
  TenantCreateResponse,
  TenantSummary,
  TenantReadiness,
  TenantUpdatePayload,
  UserProfile,
} from "./types";

const SESSION_EXPIRED_EVENT = "erp-saas:session-expired";

function resolveApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();
  const platformDomain = (process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "erp.blenkotechnologies.co.tz").trim();
  const tenantSuffix = (process.env.NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX ?? "erp.blenkotechnologies.co.tz").trim();

  if (!configured) {
    return "/api";
  }

  if (typeof window !== "undefined") {
    const isLocalConfigured = configured.includes("localhost") || configured.includes("127.0.0.1");
    const isLocalBrowser = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    // Prevent accidental localhost calls in production deployments.
    if (isLocalConfigured && !isLocalBrowser) {
      return "/api";
    }

    const hostname = window.location.hostname;
    const isPlatformDomain =
      hostname === platformDomain || hostname === `www.${platformDomain}`;
    const isTenantSubdomain =
      tenantSuffix && hostname.endsWith(`.${tenantSuffix}`) && !isPlatformDomain;
    if (isTenantSubdomain && !configured.startsWith("http")) {
      const protocol = window.location.protocol === "http:" ? "http" : "https";
      return `${protocol}://${platformDomain}/api`;
    }
  }

  return configured;
}

const API_BASE = resolveApiBase();

const auditExportUrl = (limit = 500) =>
  `${API_BASE}/admin/audit-log/export?limit=${encodeURIComponent(String(limit))}`;

type ApiErrorBody = {
  detail?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

export class ApiRequestError extends Error {
  status: number;
  body: unknown;
  path: string;
  sessionExpired: boolean;

  constructor(message: string, options: { status: number; body: unknown; path: string; sessionExpired?: boolean }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.body = options.body;
    this.path = options.path;
    this.sessionExpired = Boolean(options.sessionExpired);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseErrorMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim()) {
    return body;
  }
  if (isRecord(body)) {
    const typed = body as ApiErrorBody;
    const detail = typed.detail;
    const message = typed.message;
    const error = typed.error;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (typeof message === "string" && message.trim()) return message;
    if (typeof error === "string" && error.trim()) return error;
  }
  return `Request failed: ${status}`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (isJson) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text || null;
  } catch {
    return null;
  }
}

function notifySessionExpired() {
  clearToken();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tenant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type RequestOptions = {
  idempotencyKey?: string;
};

const REFRESH_EXEMPT_PATHS = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
  "/auth/impersonate",
]);

function decodeTokenExpiryEpochSeconds(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const decoded = JSON.parse(json) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

function isTokenNearExpiry(token: string, withinSeconds = 60): boolean {
  const exp = decodeTokenExpiryEpochSeconds(token);
  if (!exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return exp - now <= withinSeconds;
}

function canAttemptRefresh(path: string): boolean {
  return !REFRESH_EXEMPT_PATHS.has(path);
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) return null;
    const body = (await parseResponseBody(response)) as { access_token?: string } | null;
    if (!body?.access_token) return null;
    saveToken(body.access_token);
    return body.access_token;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> {
  let token = getToken();
  const headers = new Headers(init?.headers ?? {});

  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token && canAttemptRefresh(path) && isTokenNearExpiry(token) && !headers.has("Authorization")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      token = refreshed;
    }
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options?.idempotencyKey) {
    headers.set("X-Idempotency-Key", options.idempotencyKey);
  }

  const performFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "include",
    });

  let response = await performFetch();
  if (response.status === 401 && canAttemptRefresh(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set("Authorization", `Bearer ${refreshed}`);
      response = await performFetch();
    }
  }
  const body = await parseResponseBody(response);

  if (!response.ok) {
    const sessionExpired = response.status === 401;
    if (sessionExpired) {
      notifySessionExpired();
    }
    throw new ApiRequestError(parseErrorMessage(body, response.status), {
      status: response.status,
      body,
      path,
      sessionExpired,
    });
  }

  return body as T;
}

async function requestOptionalEndpoint<T>(path: string, init?: RequestInit): Promise<OptionalEndpointResult<T>> {
  try {
    const data = await request<T>(path, init);
    return { supported: true, data };
  } catch (error) {
    if (isEndpointMissingError(error)) {
      return { supported: false, data: null };
    }
    throw error;
  }
}

function resolveWsBase(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const configured = API_BASE;
  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    const parsed = new URL(configured);
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    const pathname = parsed.pathname.replace(/\/+$/, "");
    const basePath = pathname.endsWith("/api") ? pathname.slice(0, -4) : pathname;
    return `${parsed.protocol}//${parsed.host}${basePath}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

function normalizeTenantCreatePayload(payload: TenantCreatePayload): TenantCreatePayload {
  const chosen = (payload.chosen_app ?? "").trim();
  if (!chosen) {
    const { chosen_app, ...legacyPayload } = payload;
    void chosen_app;
    return legacyPayload;
  }
  return { ...payload, chosen_app: chosen };
}

function shouldRetryWithoutChosenApp(error: unknown, payload: TenantCreatePayload): boolean {
  if (!payload.chosen_app) {
    return false;
  }
  if (!(error instanceof ApiRequestError) || error.status !== 422) {
    return false;
  }

  const bodyText = JSON.stringify(error.body ?? "").toLowerCase();
  return (
    bodyText.includes("chosen_app") ||
    bodyText.includes("extra fields not permitted") ||
    bodyText.includes("extra_forbidden") ||
    bodyText.includes("unexpected keyword")
  );
}

async function createTenantWithCompatibility(
  payload: TenantCreatePayload,
  idempotencyKey = createIdempotencyKey()
): Promise<TenantCreateResponse> {
  const normalizedPayload = normalizeTenantCreatePayload(payload);

  try {
    return await request<TenantCreateResponse>(
      "/tenants",
      {
        method: "POST",
        body: JSON.stringify(normalizedPayload),
      },
      { idempotencyKey }
    );
  } catch (error) {
    if (!shouldRetryWithoutChosenApp(error, normalizedPayload)) {
      throw error;
    }

    const { chosen_app, ...legacyPayload } = normalizedPayload;
    void chosen_app;

    return request<TenantCreateResponse>(
      "/tenants",
      {
        method: "POST",
        body: JSON.stringify(legacyPayload),
      },
      { idempotencyKey: createIdempotencyKey() }
    );
  }
}

export function jobStreamUrl(jobId: string): string {
  const base = resolveWsBase().replace(/\/+$/, "");
  return `${base}/ws/jobs/${encodeURIComponent(jobId)}`;
}

export function isSessionExpiredError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && error.sessionExpired;
}

export function isEndpointMissingError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && [404, 405, 501].includes(error.status);
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function onSessionExpired(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const wrapped = () => listener();
  window.addEventListener(SESSION_EXPIRED_EVENT, wrapped);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, wrapped);
}

function appendQueryValues(query: URLSearchParams, key: string, value?: string | string[]) {
  if (!value) return;
  const values = Array.isArray(value) ? value : [value];
  values
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => query.append(key, item));
}

async function downloadAuditLogCsv(limit = 500): Promise<void> {
  const token = getToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(auditExportUrl(limit), {
    method: "GET",
    headers,
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    const body = await parseResponseBody(response);
    if (response.status === 401) {
      notifySessionExpired();
    }
    throw new ApiRequestError(parseErrorMessage(body, response.status), {
      status: response.status,
      body,
      path: "/admin/audit-log/export",
      sessionExpired: response.status === 401,
    });
  }
  if (typeof window === "undefined") {
    return;
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-log.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.URL.revokeObjectURL(url);
  }
}

export const api = {
  signup: (email: string, password: string) =>
    request<UserProfile>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),

  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getCurrentUser: () => request<UserProfile>("/auth/me"),

  verifyEmail: (token: string) =>
    request<MessageResponse>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  resendVerification: () => request<MessageResponse>("/auth/resend-verification"),

  forgotPassword: (email: string) =>
    request<MessageResponse>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    request<MessageResponse>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),

  refreshToken: () => request<{ access_token: string; token_type: string }>("/auth/refresh", { method: "POST" }),

  listPlans: () => request<PlanDetail[]>("/plans"),

  getPlan: (slug: string) => request<PlanDetail>(`/plans/${encodeURIComponent(slug)}`),

  listTenants: () => request<Tenant[]>("/tenants"),

  listTenantsPaged: (
    page = 1,
    limit = 20,
    status?: string | string[],
    search?: string,
    plan?: string,
    billingStatus?: string | string[],
    paymentChannel?: string | string[],
    filterMode: "and" | "or" = "and"
  ) => {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    appendQueryValues(query, "status", status);
    appendQueryValues(query, "billing_status", billingStatus);
    appendQueryValues(query, "payment_channel", paymentChannel);
    if (search) query.set("search", search);
    if (plan) query.set("plan", plan);
    if (filterMode !== "and") query.set("filter_mode", filterMode);
    return requestOptionalEndpoint<PaginatedResult<Tenant>>(`/tenants/paged?${query.toString()}`);
  },

  getTenant: (id: string) => request<Tenant>(`/tenants/${id}`),

  createTenant: (payload: TenantCreatePayload, idempotencyKey = createIdempotencyKey()) =>
    createTenantWithCompatibility(payload, idempotencyKey),

  renewCheckout: (tenantId: string) =>
    requestOptionalEndpoint<TenantCreateResponse>(`/tenants/${tenantId}/checkout/renew`, { method: "POST" }),

  updateTenant: (id: string, payload: TenantUpdatePayload) =>
    requestOptionalEndpoint<Tenant>(`/tenants/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  checkSubdomainAvailability: (subdomain: string) =>
    request<SubdomainAvailability>(`/tenants/check-subdomain?subdomain=${encodeURIComponent(subdomain)}`),

  backupTenant: (id: string) => request<Job>(`/tenants/${id}/backup`, { method: "POST" }),

  deleteTenant: (id: string) => request<Job>(`/tenants/${id}`, { method: "DELETE" }),

  restoreTenant: (id: string, backupId: string) =>
    requestOptionalEndpoint<Job>(`/tenants/${id}/restore`, {
      method: "POST",
      body: JSON.stringify({ backup_id: backupId }),
    }),

  retryTenant: (id: string) => requestOptionalEndpoint<Job>(`/tenants/${id}/retry`, { method: "POST" }),

  resetAdminPassword: (id: string, newPassword?: string) =>
    request<ResetAdminPasswordResult>(`/tenants/${id}/reset-admin-password`, {
      method: "POST",
      body: JSON.stringify({ new_password: newPassword?.trim() || null }),
    }),

  getJob: (id: string) => request<Job>(`/jobs/${id}`),

  listAllTenants: () => request<Tenant[]>("/admin/tenants"),

  listAllTenantsPaged: (
    page = 1,
    limit = 50,
    status?: string | string[],
    search?: string,
    plan?: string,
    billingStatus?: string | string[],
    paymentChannel?: string | string[],
    filterMode: "and" | "or" = "and"
  ) => {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    appendQueryValues(query, "status", status);
    appendQueryValues(query, "billing_status", billingStatus);
    appendQueryValues(query, "payment_channel", paymentChannel);
    if (search) query.set("search", search);
    if (plan) query.set("plan", plan);
    if (filterMode !== "and") query.set("filter_mode", filterMode);
    return requestOptionalEndpoint<PaginatedResult<Tenant>>(`/admin/tenants/paged?${query.toString()}`);
  },

  requestImpersonationLink: (targetEmail: string, reason: string) =>
    requestOptionalEndpoint<ImpersonationLink>("/admin/impersonation-links", {
      method: "POST",
      body: JSON.stringify({ target_email: targetEmail, reason }),
    }),

  exchangeImpersonationToken: (token: string) =>
    request<{ access_token: string; token_type: string }>("/auth/impersonate", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  listDeadLetterJobs: () => requestOptionalEndpoint<DeadLetterJob[]>("/admin/jobs/dead-letter"),

  requeueDeadLetterJob: (jobId: string) =>
    requestOptionalEndpoint<MessageResponse>(`/admin/jobs/dead-letter/${encodeURIComponent(jobId)}/requeue`, {
      method: "POST",
    }),

  suspendTenant: (tenantId: string, reason?: string) => {
    const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return requestOptionalEndpoint<MessageResponse>(`/admin/tenants/${tenantId}/suspend${query}`, { method: "POST" });
  },

  unsuspendTenant: (tenantId: string, reason?: string) => {
    const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return requestOptionalEndpoint<MessageResponse>(`/admin/tenants/${tenantId}/unsuspend${query}`, { method: "POST" });
  },

  listTenantBackups: (tenantId: string) => requestOptionalEndpoint<BackupManifestEntry[]>(`/tenants/${tenantId}/backups`),

  getTenantSummary: (tenantId: string) => requestOptionalEndpoint<TenantSummary>(`/tenants/${tenantId}/summary`),

  getTenantReadiness: (tenantId: string) =>
    requestOptionalEndpoint<TenantReadiness>(`/tenants/${tenantId}/readiness`),

  listTenantAuditLog: (tenantId: string, page = 1, limit = 50) =>
    requestOptionalEndpoint<PaginatedResult<AuditLogEntry>>(
      `/tenants/${tenantId}/audit-log?page=${page}&limit=${limit}`
    ),

  listTenantMembers: (tenantId: string) =>
    requestOptionalEndpoint<TenantMember[]>(`/tenants/${tenantId}/members`),

  listTenantDomains: (tenantId: string) =>
    requestOptionalEndpoint<DomainMapping[]>(`/tenants/${tenantId}/domains`),

  createTenantDomain: (tenantId: string, domain: string) =>
    requestOptionalEndpoint<DomainMapping>(`/tenants/${tenantId}/domains`, {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),

  verifyTenantDomain: (tenantId: string, mappingId: string, token?: string | null) =>
    requestOptionalEndpoint<DomainMapping>(`/tenants/${tenantId}/domains/${encodeURIComponent(mappingId)}/verify`, {
      method: "POST",
      body: JSON.stringify({ token: token ?? null }),
    }),

  deleteTenantDomain: (tenantId: string, mappingId: string) =>
    requestOptionalEndpoint<MessageResponse>(`/tenants/${tenantId}/domains/${encodeURIComponent(mappingId)}`, {
      method: "DELETE",
    }),

  inviteTenantMember: (tenantId: string, payload: { email: string; role: string }) =>
    requestOptionalEndpoint<TenantMember>(`/tenants/${tenantId}/members`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateTenantMemberRole: (tenantId: string, memberId: string, role: string) =>
    requestOptionalEndpoint<TenantMember>(`/tenants/${tenantId}/members/${encodeURIComponent(memberId)}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  removeTenantMember: (tenantId: string, memberId: string) =>
    requestOptionalEndpoint<MessageResponse>(`/tenants/${tenantId}/members/${encodeURIComponent(memberId)}`, {
      method: "DELETE",
    }),

  listAdminJobs: (limit = 50) => requestOptionalEndpoint<Job[]>(`/admin/jobs?limit=${encodeURIComponent(String(limit))}`),

  getAdminJobLogs: (jobId: string) => requestOptionalEndpoint<Job>(`/admin/jobs/${encodeURIComponent(jobId)}/logs`),

  listAuditLog: (page = 1, limit = 50) =>
    requestOptionalEndpoint<PaginatedResult<AuditLogEntry>>(`/admin/audit-log?page=${page}&limit=${limit}`),

  downloadAuditLogCsv,

  auditExportUrl,

  listSupportNotes: (tenantId: string) =>
    requestOptionalEndpoint<SupportNote[]>(`/admin/support-notes?tenant_id=${encodeURIComponent(tenantId)}`),

  listSupportNotesAll: () => requestOptionalEndpoint<SupportNote[]>(`/admin/support-notes`),

  listBillingDunning: () => requestOptionalEndpoint<DunningItem[]>(`/admin/billing/dunning`),

  runBillingDunningCycle: (dryRun = false) =>
    requestOptionalEndpoint<MessageResponse>(
      `/admin/billing/dunning/run?dry_run=${encodeURIComponent(String(dryRun))}`,
      { method: "POST" }
    ),

  rebuildPlatformAssets: () =>
    requestOptionalEndpoint<MessageResponse>("/admin/maintenance/assets/build", { method: "POST" }),

  syncTenantTLS: (primeCerts = false) =>
    requestOptionalEndpoint<MessageResponse>(
      `/admin/maintenance/tls/sync?prime_certs=${encodeURIComponent(String(primeCerts))}`,
      { method: "POST" }
    ),

  createSupportNote: (
    tenantId: string,
    category: string,
    note: string,
    extras?: { owner_name?: string; owner_contact?: string; sla_due_at?: string; status?: string }
  ) =>
    requestOptionalEndpoint<SupportNote>(`/admin/support-notes`, {
      method: "POST",
      body: JSON.stringify({ tenant_id: tenantId, category, note, ...(extras ?? {}) }),
    }),

  updateSupportNote: (noteId: string, payload: Partial<SupportNote>) =>
    requestOptionalEndpoint<SupportNote>(`/admin/support-notes/${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getBillingPortal: () => requestOptionalEndpoint<BillingPortalResponse>("/billing/portal"),

  listBillingInvoices: () => requestOptionalEndpoint<BillingInvoiceListResponse>("/billing/invoices"),

  getAdminMetrics: () => requestOptionalEndpoint<MetricsSummary>("/admin/metrics"),

  authHealth: () => requestOptionalEndpoint<MessageResponse>("/auth/health"),

  billingHealth: () => requestOptionalEndpoint<MessageResponse>("/billing/health"),
};
