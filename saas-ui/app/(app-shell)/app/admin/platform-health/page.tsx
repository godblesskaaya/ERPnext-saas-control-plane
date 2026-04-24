"use client";

import { useEffect, useMemo, useState } from "react";

import { getSessionRole } from "../../../../../domains/auth/auth";
import {
  getPlatformOpsErrorMessage,
  loadPlatformHealthSnapshot,
  runPlatformMaintenanceAction,
  type MaintenanceAction,
} from "../../../../../domains/platform-ops/application/platformHealthUseCases";
import type { Job, Tenant, TenantRuntimeConsistencyReport } from "../../../../../domains/shared/lib/types";

type ApiHealth = {
  status?: string;
  service?: string;
  checks?: Record<string, string>;
};

function runtimeClassificationLabel(classification: string): string {
  switch (classification) {
    case "runtime_expected_missing":
      return "Expected runtime missing";
    case "pending_without_runtime":
      return "Pending without runtime";
    case "pending_payment_without_runtime":
      return "Pending payment without runtime";
    case "deleted_with_runtime":
      return "Deleted row still has runtime";
    default:
      return classification.replace(/_/g, " ");
  }
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
  });
}

export default function PlatformHealthPage() {
  const [operatorRole, setOperatorRole] = useState("user");
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [billingHealth, setBillingHealth] = useState<string>("checking");
  const [authHealth, setAuthHealth] = useState<string>("checking");
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [tenantRuntimeConsistency, setTenantRuntimeConsistency] = useState<TenantRuntimeConsistencyReport | null>(null);
  const canRunAdminOnlyActions = operatorRole === "admin";

  useEffect(() => {
    const role = getSessionRole() ?? "user";
    setOperatorRole(role);
  }, []);

  const load = async () => {
    setLoading(true);
    setHealthError(null);
    try {
      const snapshot = await loadPlatformHealthSnapshot();
      setHealth(snapshot.health);
      setJobs(snapshot.jobs);
      setTenants(snapshot.tenants);
      setAuthHealth(snapshot.authHealth);
      setBillingHealth(snapshot.billingHealth);
      setTenantRuntimeConsistency(snapshot.tenantRuntimeConsistency);
      if (!snapshot.healthAvailable) {
        setHealthError("API health endpoint is not available.");
      }
    } catch (err) {
      setHealthError(getPlatformOpsErrorMessage(err, "Failed to load platform health."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runMaintenance = async (action: MaintenanceAction) => {
    if (!canRunAdminOnlyActions) {
      setMaintenanceError("Only admin role can run maintenance actions.");
      return;
    }
    setMaintenanceBusy(true);
    setMaintenanceError(null);
    setMaintenanceMessage(null);
    try {
      const result = await runPlatformMaintenanceAction(action);
      if (result.supported) {
        setMaintenanceMessage(result.message);
      } else {
        setMaintenanceError(result.message);
      }
    } catch (err) {
      setMaintenanceError(getPlatformOpsErrorMessage(err, "Maintenance action failed."));
    } finally {
      setMaintenanceBusy(false);
    }
  };

  const failedJobs = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "failed"), [jobs]);
  const runningJobs = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "running"), [jobs]);
  const queuedJobs = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "queued"), [jobs]);
  const suspendedTenants = useMemo(
    () => tenants.filter((tenant) => tenant.status.toLowerCase().includes("suspended")).length,
    [tenants]
  );
  const runtimeGapCount = useMemo(() => {
    if (!tenantRuntimeConsistency) return 0;
    return tenantRuntimeConsistency.entries.length + tenantRuntimeConsistency.runtime_only_sites.length;
  }, [tenantRuntimeConsistency]);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Platform health</p>
          <h1 className="text-3xl font-semibold text-slate-900">Infrastructure readiness</h1>
          <p className="text-sm text-slate-600">Operational status for core services, queues, and tenant load.</p>
        </div>
        <button
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh health"}
        </button>
      </div>

      {healthError ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{healthError}</p> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">API status</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{health?.status ?? "unknown"}</p>
          <p className="mt-1 text-xs text-slate-500">{health?.service ?? "Control plane API"}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Auth health</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{authHealth}</p>
          <p className="mt-1 text-xs text-slate-500">/api/auth/health</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Billing health</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{billingHealth}</p>
          <p className="mt-1 text-xs text-slate-500">/api/billing/health</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900">
          <p className="text-xs uppercase tracking-wide opacity-80">Suspended tenants</p>
          <p className="mt-1 text-2xl font-semibold">{suspendedTenants}</p>
          <p className="mt-1 text-xs opacity-80">Billing/Admin suspensions</p>
        </article>
      </div>


<div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold text-slate-900">Tenant runtime consistency</h2>
      <p className="mt-1 text-sm text-slate-600">
        Highlights tenant rows that do not reconcile with actual ERP runtimes so operators can clean stale state before it leaks into billing or support workflows.
      </p>
    </div>
    <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">
      {runtimeGapCount} open reconciliation signal(s)
    </div>
  </div>

  {tenantRuntimeConsistency ? (
    <>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="text-xs uppercase tracking-wide opacity-80">Expected runtime missing</p>
          <p className="mt-1 text-2xl font-semibold">{tenantRuntimeConsistency.runtime_expected_missing}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900">
          <p className="text-xs uppercase tracking-wide opacity-80">Pending without runtime</p>
          <p className="mt-1 text-2xl font-semibold">{tenantRuntimeConsistency.pending_without_runtime}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900">
          <p className="text-xs uppercase tracking-wide opacity-80">Pending payment without runtime</p>
          <p className="mt-1 text-2xl font-semibold">{tenantRuntimeConsistency.pending_payment_without_runtime}</p>
        </article>
        <article className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="text-xs uppercase tracking-wide opacity-80">Deleted with runtime</p>
          <p className="mt-1 text-2xl font-semibold">{tenantRuntimeConsistency.deleted_with_runtime}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900">
          <p className="text-xs uppercase tracking-wide opacity-80">Runtime-only sites</p>
          <p className="mt-1 text-2xl font-semibold">{tenantRuntimeConsistency.runtime_sites_without_db_entry}</p>
        </article>
      </div>

      {tenantRuntimeConsistency.entries.length ? (
        <div className="mt-4 space-y-3">
          {tenantRuntimeConsistency.entries.map((entry) => (
            <div key={entry.tenant_id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{entry.domain}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {runtimeClassificationLabel(entry.classification)} · status={entry.status} · subscription={entry.subscription_status ?? "n/a"} · plan={entry.plan ?? "n/a"}
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                  {entry.runtime_exists ? "runtime found" : "runtime missing"}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                <p>Owner: <span className="font-medium text-slate-900">{entry.owner_email ?? "—"}</span></p>
                <p>Last job: <span className="font-medium text-slate-900">{entry.last_job_type ?? "—"} {entry.last_job_status ? `(${entry.last_job_status})` : ""}</span></p>
                <p>Last job at: <span className="font-medium text-slate-900">{formatDate(entry.last_job_at)}</span></p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          No tenant-runtime mismatches detected right now.
        </p>
      )}

      {tenantRuntimeConsistency.runtime_only_sites.length ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Runtime sites without DB rows</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tenantRuntimeConsistency.runtime_only_sites.map((site) => (
              <span key={site} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                {site}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  ) : (
    <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      Tenant runtime consistency report is not available on this backend deployment.
    </p>
  )}
</div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Queue health</h2>
          <p className="mt-1 text-sm text-slate-600">Job backlog and failure signal across the platform.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900">
              <p className="text-xs uppercase tracking-wide opacity-80">Queued jobs</p>
              <p className="mt-1 text-2xl font-semibold">{queuedJobs.length}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900">
              <p className="text-xs uppercase tracking-wide opacity-80">Running jobs</p>
              <p className="mt-1 text-2xl font-semibold">{runningJobs.length}</p>
            </article>
            <article className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
              <p className="text-xs uppercase tracking-wide opacity-80">Failed jobs</p>
              <p className="mt-1 text-2xl font-semibold">{failedJobs.length}</p>
            </article>
          </div>

          {failedJobs.length ? (
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              {failedJobs.slice(0, 5).map((job) => (
                <div key={job.id} className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-red-500">{formatDate(job.created_at)}</p>
                  <p className="mt-1 text-sm font-semibold text-red-800">{job.type}</p>
                  <p className="mt-1 text-xs text-red-700">{job.error ?? "Failed job"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              No failed jobs in the last 80 operations.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6">
            <h2 className="text-lg font-semibold text-slate-900">Core service checks</h2>
            <p className="mt-1 text-sm text-slate-600">Postgres and Redis health from the API node.</p>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              {health?.checks ? (
                Object.entries(health.checks).map(([service, status]) => (
                  <div key={service} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2">
                    <span className="text-xs uppercase tracking-wide text-slate-500">{service}</span>
                    <span className="text-sm font-semibold text-slate-900">{status}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  No infrastructure checks returned.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6">
            <h2 className="text-lg font-semibold text-slate-900">Maintenance actions</h2>
            <p className="mt-1 text-sm text-slate-600">
              Run platform fixes for tenant TLS certificates and ERP assets when customers report 404s.
            </p>
            <div className="mt-4 space-y-2">
              {canRunAdminOnlyActions ? (
                <>
                  <button
                    className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
                    onClick={() => void runMaintenance("assets")}
                    disabled={maintenanceBusy}
                  >
                    Rebuild ERP assets
                  </button>
                  <button
                    className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
                    onClick={() => void runMaintenance("tls")}
                    disabled={maintenanceBusy}
                  >
                    Sync tenant TLS routes
                  </button>
                  <button
                    className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 hover:border-slate-300 disabled:opacity-60"
                    onClick={() => void runMaintenance("tls-prime")}
                    disabled={maintenanceBusy}
                  >
                    Prime tenant certificates
                  </button>
                </>
              ) : (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  Read-only maintenance view for support role. Ask an admin to execute maintenance actions.
                </p>
              )}
            </div>
            {maintenanceMessage ? (
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                {maintenanceMessage}
              </p>
            ) : null}
            {maintenanceError ? (
              <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {maintenanceError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
