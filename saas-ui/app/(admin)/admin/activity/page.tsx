"use client";

import { useEffect, useMemo, useState } from "react";

import {
  loadAdminJobs,
  loadTenantCatalog,
  toAdminErrorMessage,
} from "../../../../domains/admin-ops/application/adminUseCases";
import type { Job, Tenant } from "../../../../domains/shared/lib/types";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleString()} EAT`;
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "failed") return "bg-red-100 text-red-700";
  if (normalized === "running") return "bg-slate-100 text-slate-800";
  if (normalized === "succeeded") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-600";
}

export default function DashboardActivityPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tenantMap, setTenantMap] = useState<Record<string, Tenant>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsResult, tenantList] = await Promise.all([loadAdminJobs(50), loadTenantCatalog()]);
      if (jobsResult.supported) {
        setJobs(jobsResult.data);
      } else {
        setError("Jobs timeline is not enabled on this backend.");
      }
      const map: Record<string, Tenant> = {};
      tenantList.forEach((tenant) => {
        map[tenant.id] = tenant;
      });
      setTenantMap(map);
    } catch (err) {
      setError(toAdminErrorMessage(err, "Failed to load job activity."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runningCount = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "running").length, [jobs]);
  const failedCount = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "failed").length, [jobs]);
  const queuedCount = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "queued").length, [jobs]);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Operations timeline</p>
          <h1 className="text-3xl font-semibold text-slate-900">Jobs & activity</h1>
          <p className="text-sm text-slate-600">
            Chronological feed of provisioning, upgrades, backups, and admin actions across all tenants.
          </p>
        </div>
        <button
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh data"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Jobs tracked</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{jobs.length}</p>
          <p className="mt-1 text-xs text-slate-500">Last 50 operations</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900">
          <p className="text-xs uppercase tracking-wide opacity-80">Queued</p>
          <p className="mt-1 text-2xl font-semibold">{queuedCount}</p>
          <p className="mt-1 text-xs opacity-80">Waiting for worker capacity</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900">
          <p className="text-xs uppercase tracking-wide opacity-80">Running</p>
          <p className="mt-1 text-2xl font-semibold">{runningCount}</p>
          <p className="mt-1 text-xs opacity-80">Live operations in progress</p>
        </article>
        <article className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="text-xs uppercase tracking-wide opacity-80">Failed</p>
          <p className="mt-1 text-2xl font-semibold">{failedCount}</p>
          <p className="mt-1 text-xs opacity-80">Needs follow-up</p>
        </article>
      </div>

      <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Ops timeline</p>
            <p className="text-xs text-slate-500">Most recent operational actions (EAT timezone).</p>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 space-y-3 text-sm text-slate-700">
          {jobs.length ? (
            jobs.map((job) => {
              const tenant = tenantMap[job.tenant_id];
              return (
                <div key={job.id} className="rounded-2xl border border-slate-200/70 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{formatDate(job.created_at)}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{job.type}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {tenant ? `${tenant.company_name} • ${tenant.subdomain}` : job.tenant_id}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(job.status)}`}>
                      {job.status}
                    </span>
                  </div>
                  {job.error ? <p className="mt-2 text-xs text-red-600">{job.error}</p> : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-sm text-slate-600">
              No recent jobs yet. Provisioning and backups will appear here once scheduled.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
