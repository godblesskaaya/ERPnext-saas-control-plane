"use client";

import { buildTenantActionPhrase } from "../../../../domains/admin-ops/domain/adminDashboard";
import type { Tenant } from "../../../../domains/shared/lib/types";
import { formatDate, statusBadgeClass } from "./adminConsoleFormatters";

type AdminTenantsViewProps = {
  tenantsError: string | null;
  onRefreshTenants: () => void;
  tenantSearch: string;
  onTenantSearchChange: (value: string) => void;
  tenantStatusFilter: string;
  onTenantStatusFilterChange: (value: string) => void;
  tenantPlanFilter: string;
  onTenantPlanFilterChange: (value: string) => void;
  tenants: Tenant[];
  busyTenantId: string | null;
  onOpenTenantAction: (payload: { type: "suspend" | "unsuspend"; tenant: Tenant; phrase: string }) => void;
  tenantPage: number;
  tenantTotalPages: number;
  tenantTotal: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export function AdminTenantsView({
  tenantsError,
  onRefreshTenants,
  tenantSearch,
  onTenantSearchChange,
  tenantStatusFilter,
  onTenantStatusFilterChange,
  tenantPlanFilter,
  onTenantPlanFilterChange,
  tenants,
  busyTenantId,
  onOpenTenantAction,
  tenantPage,
  tenantTotalPages,
  tenantTotal,
  onPreviousPage,
  onNextPage,
}: AdminTenantsViewProps) {
  return (
    <div className="rounded-xl border border-slate-700 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Tenant intervention panel</h2>
        <button className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800" onClick={onRefreshTenants}>
          Refresh
        </button>
      </div>

      {tenantsError ? <p className="mb-2 text-sm text-red-400">{tenantsError}</p> : null}

      <div className="mb-3 grid gap-2 md:grid-cols-[1.2fr_1fr_1fr]">
        <input
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
          placeholder="Search by company, subdomain, or domain"
          value={tenantSearch}
          onChange={(event) => onTenantSearchChange(event.target.value)}
        />
        <select
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
          value={tenantStatusFilter}
          onChange={(event) => onTenantStatusFilterChange(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_payment">Pending payment</option>
          <option value="pending">Pending</option>
          <option value="provisioning">Provisioning</option>
          <option value="failed">Failed</option>
          <option value="suspended">Suspended (all)</option>
          <option value="suspended_admin">Suspended (admin)</option>
          <option value="suspended_billing">Suspended (billing)</option>
        </select>
        <select
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
          value={tenantPlanFilter}
          onChange={(event) => onTenantPlanFilterChange(event.target.value)}
        >
          <option value="all">All plans</option>
          <option value="starter">Starter</option>
          <option value="business">Business</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-300">
            <tr>
              <th className="p-2">Company</th>
              <th className="p-2">Plan/focus</th>
              <th className="p-2">Health</th>
              <th className="p-2">Provider</th>
              <th className="p-2">Created</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-slate-700/80">
                <td className="space-y-1 p-2">
                  <p className="font-medium text-white">{tenant.company_name}</p>
                  <p className="text-xs text-slate-300">{tenant.domain}</p>
                  <p className="font-mono text-[11px] text-slate-500">{tenant.id}</p>
                </td>
                <td className="p-2 text-xs text-slate-200">
                  <p>{tenant.plan}</p>
                  <p className="text-slate-400">{tenant.chosen_app || "auto"}</p>
                </td>
                <td className="p-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(tenant.status)}`}>
                    {tenant.status}
                  </span>
                </td>
                <td className="p-2 text-xs text-slate-300">{tenant.payment_provider || "n/a"}</td>
                <td className="p-2 text-xs text-slate-300">{formatDate(tenant.created_at)}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <a href={`/tenants/${tenant.id}`} className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800">
                      Details
                    </a>
                    {["suspended", "suspended_admin", "suspended_billing"].includes(tenant.status.toLowerCase()) ? (
                      <button
                        type="button"
                        disabled={busyTenantId === tenant.id}
                        className="rounded bg-emerald-700 px-2 py-1 text-xs hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() =>
                          onOpenTenantAction({
                            type: "unsuspend",
                            tenant,
                            phrase: buildTenantActionPhrase(tenant.subdomain),
                          })
                        }
                      >
                        {busyTenantId === tenant.id ? "Reactivating..." : "Unsuspend"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyTenantId === tenant.id}
                        className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() =>
                          onOpenTenantAction({
                            type: "suspend",
                            tenant,
                            phrase: buildTenantActionPhrase(tenant.subdomain),
                          })
                        }
                      >
                        {busyTenantId === tenant.id ? "Suspending..." : "Suspend"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!tenants.length && !tenantsError ? <p className="mt-3 text-sm text-slate-300">No tenants found.</p> : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          Page {tenantPage} of {tenantTotalPages} • {tenantTotal} tenants
        </span>
        <div className="flex gap-2">
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
            disabled={tenantPage <= 1}
            onClick={onPreviousPage}
          >
            Previous
          </button>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
            disabled={tenantPage >= tenantTotalPages}
            onClick={onNextPage}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

