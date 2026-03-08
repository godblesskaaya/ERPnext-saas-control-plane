"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { JobLogPanel } from "../../components/JobLogPanel";
import { api, getApiErrorMessage } from "../../lib/api";
import type { DeadLetterJob, Job, Tenant } from "../../lib/types";

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-emerald-500/20 text-emerald-300";
  if (normalized === "provisioning" || normalized === "pending" || normalized === "deleting") {
    return "bg-amber-500/20 text-amber-300";
  }
  if (normalized === "failed") return "bg-red-500/20 text-red-300";
  if (normalized === "deleted") return "bg-slate-500/20 text-slate-300";
  if (normalized === "suspended") return "bg-orange-500/20 text-orange-300";
  return "bg-sky-500/20 text-sky-300";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function metricCard(label: string, value: number, hint: string, tone: "default" | "good" | "warn" = "default") {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
      : "border-slate-700 bg-slate-900/70 text-slate-100";

  return (
    <article className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{hint}</p>
    </article>
  );
}

export default function AdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null);

  const [deadLetters, setDeadLetters] = useState<DeadLetterJob[]>([]);
  const [deadLetterSupported, setDeadLetterSupported] = useState(true);
  const [deadLetterError, setDeadLetterError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsSupported, setJobsSupported] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedJobSupported, setSelectedJobSupported] = useState(true);

  const loadTenants = useCallback(async () => {
    try {
      const data = await api.listAllTenants();
      setTenants(data);
      setTenantsError(null);
    } catch (err) {
      setTenantsError(getApiErrorMessage(err, "Failed to load admin tenants"));
      setTenants([]);
    }
  }, []);

  const loadDeadLetters = useCallback(async () => {
    try {
      const result = await api.listDeadLetterJobs();
      if (!result.supported) {
        setDeadLetterSupported(false);
        setDeadLetters([]);
        setDeadLetterError(null);
        return;
      }
      setDeadLetterSupported(true);
      setDeadLetters(result.data);
      setDeadLetterError(null);
    } catch (err) {
      setDeadLetterError(getApiErrorMessage(err, "Failed to load dead-letter queue"));
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const result = await api.listAdminJobs(100);
      if (!result.supported) {
        setJobsSupported(false);
        setJobs([]);
        setJobsError(null);
        return;
      }
      setJobsSupported(true);
      setJobs(result.data);
      setJobsError(null);
    } catch (err) {
      setJobsError(getApiErrorMessage(err, "Failed to load jobs"));
    }
  }, []);

  const loadJobLogs = useCallback(async (jobId: string) => {
    try {
      const result = await api.getAdminJobLogs(jobId);
      if (!result.supported) {
        setSelectedJobSupported(false);
        return;
      }
      setSelectedJobSupported(true);
      setSelectedJob(result.data);
    } catch (err) {
      setJobsError(getApiErrorMessage(err, "Failed to load job logs"));
    }
  }, []);

  useEffect(() => {
    void loadTenants();
    void loadDeadLetters();
    void loadJobs();
  }, [loadDeadLetters, loadJobs, loadTenants]);

  const suspendedCount = useMemo(
    () => tenants.filter((tenant) => tenant.status.toLowerCase() === "suspended").length,
    [tenants]
  );
  const provisioningCount = useMemo(
    () => tenants.filter((tenant) => ["pending", "pending_payment", "provisioning"].includes(tenant.status.toLowerCase())).length,
    [tenants]
  );
  const failedCount = useMemo(() => tenants.filter((tenant) => tenant.status.toLowerCase() === "failed").length, [tenants]);
  const activeCount = useMemo(() => tenants.filter((tenant) => tenant.status.toLowerCase() === "active").length, [tenants]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Admin Control Center</h1>
          <p className="text-sm text-slate-300">
            Keep tenant reliability high with fast attention routing for setup delays, failures, and governance tasks.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800" onClick={() => void loadTenants()}>
            Refresh tenants
          </button>
          <button className="rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800" onClick={() => void loadJobs()}>
            Refresh jobs
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-white">Attention lane</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              failedCount || suspendedCount || deadLetters.length ? "bg-amber-500/20 text-amber-200" : "bg-emerald-500/20 text-emerald-200"
            }`}
          >
            {failedCount || suspendedCount || deadLetters.length ? "Intervention recommended" : "Platform healthy"}
          </span>
        </div>
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
          <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-slate-300">
            Active tenants: <span className="font-semibold text-emerald-200">{activeCount}</span>
          </p>
          <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-slate-300">
            Setup queue: <span className="font-semibold text-amber-200">{provisioningCount}</span>
          </p>
          <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-slate-300">
            Failed: <span className="font-semibold text-red-200">{failedCount}</span>
          </p>
          <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-slate-300">
            Dead letters: <span className="font-semibold text-orange-200">{deadLetters.length}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {metricCard("Total tenants", tenants.length, "All managed customer environments")}
        {metricCard("Suspended", suspendedCount, "Access paused pending review", suspendedCount ? "warn" : "default")}
        {metricCard("Provisioning", provisioningCount, "Still onboarding or awaiting payment", provisioningCount ? "warn" : "default")}
        {metricCard("Failed", failedCount, "Requires immediate operator follow-up", failedCount ? "warn" : "good")}
      </div>

      <div className="rounded-xl border border-slate-700 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Execution monitor</h2>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={() => {
              void loadJobs();
            }}
          >
            Refresh
          </button>
        </div>

        {!jobsSupported ? (
          <p className="text-sm text-slate-300">Admin jobs endpoint is not available on this backend.</p>
        ) : jobsError ? (
          <p className="text-sm text-red-400">{jobsError}</p>
        ) : jobs.length ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-300">
                  <tr>
                    <th className="p-2">Job ID</th>
                    <th className="p-2">Tenant ID</th>
                    <th className="p-2">Flow</th>
                    <th className="p-2">Health</th>
                    <th className="p-2">Created</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-t border-slate-700">
                      <td className="p-2 font-mono text-xs">{job.id}</td>
                      <td className="p-2 font-mono text-xs">{job.tenant_id}</td>
                      <td className="p-2 text-xs">{job.type}</td>
                      <td className="p-2 text-xs">{job.status}</td>
                      <td className="p-2 text-xs text-slate-300">{formatDate(job.created_at)}</td>
                      <td className="p-2 text-right">
                        <button
                          className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
                          onClick={() => {
                            void loadJobLogs(job.id);
                          }}
                        >
                          Inspect logs
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedJob ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-300">
                  Showing logs for job <span className="font-mono">{selectedJob.id}</span>
                </p>
                {selectedJobSupported ? (
                  <JobLogPanel jobId={selectedJob.id} logs={selectedJob.logs} status={selectedJob.status} />
                ) : (
                  <pre className="max-h-72 overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
                    {selectedJob.logs || "No logs available."}
                  </pre>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-300">No jobs found. Trigger provisioning or maintenance actions to populate this feed.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-700 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Tenant intervention panel</h2>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={() => {
              void loadTenants();
            }}
          >
            Refresh
          </button>
        </div>

        {tenantsError ? <p className="mb-2 text-sm text-red-400">{tenantsError}</p> : null}

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
                      <button
                        type="button"
                        disabled={busyTenantId === tenant.id}
                        className="rounded bg-amber-700 px-2 py-1 text-xs hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={async () => {
                          const approved = window.confirm(`Suspend ${tenant.company_name}?`);
                          if (!approved) return;

                          setBusyTenantId(tenant.id);
                          try {
                            const result = await api.suspendTenant(tenant.id);
                            if (!result.supported) {
                              setTenantsError("Suspend endpoint is not available on this backend.");
                              return;
                            }
                            await loadTenants();
                          } catch (err) {
                            setTenantsError(getApiErrorMessage(err, "Failed to suspend tenant"));
                          } finally {
                            setBusyTenantId(null);
                          }
                        }}
                      >
                        {busyTenantId === tenant.id ? "Suspending..." : "Suspend"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!tenants.length && !tenantsError ? <p className="mt-3 text-sm text-slate-300">No tenants found.</p> : null}
      </div>

      <div className="rounded-xl border border-slate-700 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Recovery queue (dead-letter)</h2>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={() => {
              void loadDeadLetters();
            }}
          >
            Refresh
          </button>
        </div>

        {!deadLetterSupported ? (
          <p className="text-sm text-slate-300">Dead-letter endpoint is not available on this backend.</p>
        ) : deadLetterError ? (
          <p className="text-sm text-red-400">{deadLetterError}</p>
        ) : deadLetters.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="p-2">ID</th>
                  <th className="p-2">Worker function</th>
                  <th className="p-2">Queued</th>
                  <th className="p-2">Args</th>
                </tr>
              </thead>
              <tbody>
                {deadLetters.map((job) => (
                  <tr key={job.id} className="border-t border-slate-700">
                    <td className="p-2 font-mono text-xs">{job.id}</td>
                    <td className="p-2 text-xs">{job.func_name}</td>
                    <td className="p-2 text-xs text-slate-300">{formatDate(job.enqueued_at)}</td>
                    <td className="p-2 text-xs text-slate-300">
                      <code>{JSON.stringify(job.args).slice(0, 120)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-300">No dead-letter jobs.</p>
        )}
      </div>
    </section>
  );
}
