import { getToken } from "./auth";

function resolveApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();

  if (!configured) {
    return "/api";
  }

  if (typeof window !== "undefined") {
    const isLocalConfigured =
      configured.includes("localhost") || configured.includes("127.0.0.1");
    const isLocalBrowser =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    // Prevent accidental localhost calls in production deployments.
    if (isLocalConfigured && !isLocalBrowser) {
      return "/api";
    }
  }

  return configured;
}

const API_BASE = resolveApiBase();

async function request(path: string, init?: RequestInit) {
  const token = getToken();
  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
}

export const api = {
  signup: (email: string, password: string) =>
    request("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  listTenants: () => request("/tenants"),
  getTenant: (id: string) => request(`/tenants/${id}`),
  createTenant: (payload: { subdomain: string; company_name: string; plan: string }) =>
    request("/tenants", { method: "POST", body: JSON.stringify(payload) }),
  backupTenant: (id: string) => request(`/tenants/${id}/backup`, { method: "POST" }),
  deleteTenant: (id: string) => request(`/tenants/${id}`, { method: "DELETE" }),
  resetAdminPassword: (id: string, newPassword?: string) =>
    request(`/tenants/${id}/reset-admin-password`, {
      method: "POST",
      body: JSON.stringify({ new_password: newPassword?.trim() || null }),
    }),
  getJob: (id: string) => request(`/jobs/${id}`),
  listAllTenants: () => request("/admin/tenants"),
};
