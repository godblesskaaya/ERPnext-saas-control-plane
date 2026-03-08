import { clearToken, getToken } from "./auth";
import type {
  BackupManifestEntry,
  DeadLetterJob,
  Job,
  MessageResponse,
  OptionalEndpointResult,
  ResetAdminPasswordResult,
  SubdomainAvailability,
  Tenant,
  TenantCreatePayload,
  TenantCreateResponse,
} from "./types";

const SESSION_EXPIRED_EVENT = "erp-saas:session-expired";

function resolveApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();

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
  }

  return configured;
}

const API_BASE = resolveApiBase();

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

async function request<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers ?? {});

  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options?.idempotencyKey) {
    headers.set("X-Idempotency-Key", options.idempotencyKey);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

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

export const api = {
  signup: (email: string, password: string) =>
    request<MessageResponse>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),

  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

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

  listTenants: () => request<Tenant[]>("/tenants"),

  getTenant: (id: string) => request<Tenant>(`/tenants/${id}`),

  createTenant: (payload: TenantCreatePayload, idempotencyKey = createIdempotencyKey()) =>
    createTenantWithCompatibility(payload, idempotencyKey),

  checkSubdomainAvailability: (subdomain: string) =>
    request<SubdomainAvailability>(`/tenants/check-subdomain?subdomain=${encodeURIComponent(subdomain)}`),

  backupTenant: (id: string) => request<Job>(`/tenants/${id}/backup`, { method: "POST" }),

  deleteTenant: (id: string) => request<Job>(`/tenants/${id}`, { method: "DELETE" }),

  resetAdminPassword: (id: string, newPassword?: string) =>
    request<ResetAdminPasswordResult>(`/tenants/${id}/reset-admin-password`, {
      method: "POST",
      body: JSON.stringify({ new_password: newPassword?.trim() || null }),
    }),

  getJob: (id: string) => request<Job>(`/jobs/${id}`),

  listAllTenants: () => request<Tenant[]>("/admin/tenants"),

  listDeadLetterJobs: () => requestOptionalEndpoint<DeadLetterJob[]>("/admin/jobs/dead-letter"),

  suspendTenant: (tenantId: string) =>
    requestOptionalEndpoint<MessageResponse>(`/admin/tenants/${tenantId}/suspend`, { method: "POST" }),

  unsuspendTenant: (tenantId: string) =>
    requestOptionalEndpoint<MessageResponse>(`/admin/tenants/${tenantId}/unsuspend`, { method: "POST" }),

  listTenantBackups: (tenantId: string) => requestOptionalEndpoint<BackupManifestEntry[]>(`/tenants/${tenantId}/backups`),

  listAdminJobs: (limit = 50) => requestOptionalEndpoint<Job[]>(`/admin/jobs?limit=${encodeURIComponent(String(limit))}`),

  getAdminJobLogs: (jobId: string) => requestOptionalEndpoint<Job>(`/admin/jobs/${encodeURIComponent(jobId)}/logs`),
};
