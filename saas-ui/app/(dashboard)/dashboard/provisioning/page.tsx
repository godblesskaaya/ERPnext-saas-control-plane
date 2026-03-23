"use client";

import { useEffect, useMemo, useState } from "react";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";
import { JobLogPanel } from "../../../../domains/shared/components/JobLogPanel";
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
  if (normalized === "running") return "bg-amber-100 text-amber-800";
  if (normalized === "queued") return "bg-amber-100 text-amber-800";
  if (normalized === "succeeded") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-600";
}

function isProvisioningJob(job: Job): boolean {
  const type = job.type.toLowerCase();
  return ["provision", "upgrade", "restore", "backup", "delete", "suspend"].some((keyword) => type.includes(keyword));
}

export default function DashboardProvisioningPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tenantMap, setTenantMap] = useState<Record<string, Tenant>>({});
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const loadJobs = async () => {
    setLoadingJobs(true);
    setJobsError(null);
    try {
      const [jobsResult, tenantList] = await Promise.all([loadAdminJobs(80), loadTenantCatalog()]);
      if (jobsResult.supported) {
        setJobs(jobsResult.data.filter(isProvisioningJob));
      } else {
        setJobsError("Provisioning job logs are not enabled on this backend.");
        setJobs([]);
      }
      const map: Record<string, Tenant> = {};
      tenantList.forEach((tenant) => {
        map[tenant.id] = tenant;
      });
      setTenantMap(map);
    } catch (err) {
      setJobsError(toAdminErrorMessage(err, "Failed to load provisioning jobs."));
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  const queuedCount = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "queued").length, [jobs]);
  const runningCount = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "running").length, [jobs]);
  const failedCount = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "failed").length, [jobs]);

  return (
    <WorkspaceQueuePage
      title="Provisioning queue"
      description="Deployments, upgrades, and restores still running—resolve blockers fast."
      statusFilter={["pending", "provisioning", "upgrading", "restoring", "pending_deletion"]}
      showMetrics
      showAttention
      showBillingAlert={false}
      showStatusFilter={false}
      attentionNote="Work through deployments and upgrades to keep customers live."
      emptyStateTitle="No provisioning workspaces right now"
      emptyStateBody="Deployments and upgrades are clear."
      emptyStateActionLabel="View active tenants"
      emptyStateActionHref="/dashboard/active"
      extraContent={
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Provisioning jobs</p>
                <p className="text-sm text-slate-600">Queue view for provisioning/upgrade/restore tasks.</p>
              </div>
              <button
                className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-amber-300 disabled:opacity-60"
                onClick={() => void loadJobs()}
                disabled={loadingJobs}
              >
                {loadingJobs ? "Refreshing..." : "Refresh jobs"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="text-xs uppercase tracking-wide">Queued</p>
                <p className="mt-1 text-2xl font-semibold">{queuedCount}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-white p-3 text-xs text-amber-900">
                <p className="text-xs uppercase tracking-wide">Running</p>
                <p className="mt-1 text-2xl font-semibold">{runningCount}</p>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <p className="text-xs uppercase tracking-wide">Failed</p>
                <p className="mt-1 text-2xl font-semibold">{failedCount}</p>
              </div>
            </div>

            {jobsError ? <p className="mt-4 text-sm text-red-600">{jobsError}</p> : null}

            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Created</th>
                    <th className="p-2 text-left">Tenant</th>
                    <th className="p-2 text-left">Job type</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr>
                      <td className="p-3 text-sm text-slate-500" colSpan={5}>
                        No provisioning jobs in the recent queue.
                      </td>
                    </tr>
                  ) : (
                    jobs.map((job) => {
                      const tenant = tenantMap[job.tenant_id];
                      return (
                        <tr key={job.id} className="border-t border-slate-200">
                          <td className="p-2 text-xs text-slate-700">{formatDate(job.created_at)}</td>
                          <td className="p-2 text-xs text-slate-700">
                            {tenant ? (
                              <a
                                className="font-semibold text-[#0d6a6a] hover:text-[#0b5a5a]"
                                href={`/tenants/${tenant.id}`}
                              >
                                {tenant.company_name}
                              </a>
                            ) : (
                              job.tenant_id
                            )}
                          </td>
                          <td className="p-2 text-xs text-slate-700">{job.type}</td>
                          <td className="p-2 text-xs">
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(job.status)}`}>
                              {job.status}
                            </span>
                          </td>
                          <td className="p-2 text-xs">
                            <button
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-amber-200 hover:bg-amber-50"
                              onClick={() => setSelectedJobId(job.id)}
                            >
                              View logs
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Job detail</p>
            {selectedJobId ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-600">Streaming logs for job {selectedJobId}.</p>
                <div className="rounded-2xl border border-slate-200 bg-white p-2">
                  <JobLogPanel jobId={selectedJobId} />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600">Select a job to inspect logs and status.</p>
            )}
          </div>
        </div>
      }
    />
  );
}
