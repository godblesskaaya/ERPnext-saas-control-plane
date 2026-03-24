"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  executeTenantLifecycleAction,
  exportAdminAuditCsv,
  issueSupportImpersonationLink,
  loadAdminAuditLog,
  loadAdminDeadLetterQueue,
  loadAdminJobLogs,
  loadAdminJobs,
  loadAdminMetrics,
  loadAdminTenantPage,
  requeueDeadLetterById,
  toAdminErrorMessage,
} from "../../../domains/admin-ops/application/adminUseCases";
import {
  buildTenantActionPhrase,
  deriveAdminMetricAlertKey,
  deriveAdminMetricAlerts,
  deriveAdminTenantCounts,
} from "../../../domains/admin-ops/domain/adminDashboard";
import { JobLogPanel } from "../../../domains/shared/components/JobLogPanel";
import { useNotifications } from "../../../domains/shared/components/NotificationsProvider";
import type { AuditLogEntry, DeadLetterJob, Job, MetricsSummary, Tenant } from "../../../domains/shared/lib/types";

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-emerald-500/20 text-emerald-300";
  if (
    ["provisioning", "pending", "deleting", "upgrading", "restoring", "pending_deletion"].includes(normalized)
  ) {
    return "bg-amber-500/20 text-amber-300";
  }
  if (normalized === "failed") return "bg-red-500/20 text-red-300";
  if (normalized === "deleted") return "bg-slate-500/20 text-slate-300";
  if (["suspended", "suspended_admin", "suspended_billing"].includes(normalized)) return "bg-orange-500/20 text-orange-300";
  return "bg-sky-500/20 text-sky-300";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

type TenantAdminAction = {
  type: "suspend" | "unsuspend";
  tenant: Tenant;
  phrase: string;
};

export type AdminView = "overview" | "tenants" | "jobs" | "audit" | "support" | "recovery";

const ADMIN_VIEWS: AdminView[] = ["overview", "tenants", "jobs", "audit", "support", "recovery"];
const ADMIN_VIEW_ROUTES: Record<AdminView, string> = {
  overview: "/admin/control/overview",
  tenants: "/admin/control/tenants",
  jobs: "/admin/control/jobs",
  audit: "/admin/control/audit",
  support: "/admin/control/support",
  recovery: "/admin/control/recovery",
};
const ADMIN_ROUTE_VIEW_ENTRIES = Object.entries(ADMIN_VIEW_ROUTES) as Array<[AdminView, string]>;
const ADMIN_VIEW_DETAILS: Record<AdminView, { label: string; description: string }> = {
  overview: { label: "Overview", description: "Platform health summary and control shortcuts." },
  tenants: { label: "Tenants", description: "Review status and run tenant lifecycle interventions." },
  jobs: { label: "Jobs", description: "Inspect worker execution and job logs." },
  audit: { label: "Audit", description: "Track administrative actions and export records." },
  support: { label: "Support", description: "Issue short-lived impersonation links for troubleshooting." },
  recovery: { label: "Recovery", description: "Handle dead-letter jobs and replay failures." },
};

function isAdminView(value: string | null): value is AdminView {
  return value !== null && ADMIN_VIEWS.includes(value as AdminView);
}

function inferAdminViewFromPathname(pathname: string): AdminView | null {
  for (const [view, route] of ADMIN_ROUTE_VIEW_ENTRIES) {
    if (pathname === route || pathname.startsWith(`${route}/`)) {
      return view;
    }
  }
  return null;
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

type AdminConsolePageProps = {
  forcedView?: AdminView;
};

export function AdminConsolePage({ forcedView }: AdminConsolePageProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null);
  const [tenantAction, setTenantAction] = useState<TenantAdminAction | null>(null);
  const [tenantActionInput, setTenantActionInput] = useState("");
  const [tenantActionReason, setTenantActionReason] = useState("");
  const [tenantPage, setTenantPage] = useState(1);
  const [tenantLimit] = useState(50);
  const [tenantTotal, setTenantTotal] = useState(0);
  const [requeueJobId, setRequeueJobId] = useState<string | null>(null);
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantStatusFilter, setTenantStatusFilter] = useState("all");
  const [tenantPlanFilter, setTenantPlanFilter] = useState("all");

  const [deadLetters, setDeadLetters] = useState<DeadLetterJob[]>([]);
  const [deadLetterSupported, setDeadLetterSupported] = useState(true);
  const [deadLetterError, setDeadLetterError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsSupported, setJobsSupported] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedJobSupported, setSelectedJobSupported] = useState(true);

  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditSupported, setAuditSupported] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit] = useState(50);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditExportBusy, setAuditExportBusy] = useState(false);
  const [auditExportError, setAuditExportError] = useState<string | null>(null);

  const [impersonationEmail, setImpersonationEmail] = useState("");
  const [impersonationReason, setImpersonationReason] = useState("Support troubleshooting");
  const [impersonationLink, setImpersonationLink] = useState<string | null>(null);
  const [impersonationToken, setImpersonationToken] = useState<string | null>(null);
  const [impersonationBusy, setImpersonationBusy] = useState(false);
  const [impersonationError, setImpersonationError] = useState<string | null>(null);
  const { addNotification } = useNotifications();
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [metricsSupported, setMetricsSupported] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const lastMetricsKey = useRef<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentView = useMemo<AdminView>(() => {
    if (forcedView) {
      return forcedView;
    }
    const pathView = inferAdminViewFromPathname(pathname);
    if (pathView) {
      return pathView;
    }
    const viewParam = searchParams.get("view");
    return isAdminView(viewParam) ? viewParam : "overview";
  }, [forcedView, pathname, searchParams]);

  const buildViewHref = useCallback((view: AdminView) => ADMIN_VIEW_ROUTES[view], []);

  const loadTenants = useCallback(async () => {
    try {
      const loaded = await loadAdminTenantPage({
        page: tenantPage,
        limit: tenantLimit,
        status: tenantStatusFilter === "all" ? undefined : tenantStatusFilter,
        search: tenantSearch.trim(),
        plan: tenantPlanFilter === "all" ? undefined : tenantPlanFilter,
      });
      setTenants(loaded.tenants);
      setTenantTotal(loaded.total);
      setTenantsError(null);
    } catch (err) {
      setTenantsError(toAdminErrorMessage(err, "Failed to load admin tenants"));
      setTenants([]);
    }
  }, [tenantLimit, tenantPage, tenantPlanFilter, tenantSearch, tenantStatusFilter]);

  const loadDeadLetters = useCallback(async () => {
    try {
      const result = await loadAdminDeadLetterQueue();
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
      setDeadLetterError(toAdminErrorMessage(err, "Failed to load dead-letter queue"));
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const result = await loadAdminJobs(100);
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
      setJobsError(toAdminErrorMessage(err, "Failed to load jobs"));
    }
  }, []);

  const loadAuditLog = useCallback(async () => {
    try {
      const result = await loadAdminAuditLog(auditPage, auditLimit);
      if (!result.supported) {
        setAuditSupported(false);
        setAuditLog([]);
        setAuditError(null);
        return;
      }
      setAuditSupported(true);
      setAuditLog(result.entries);
      setAuditTotal(result.total);
      setAuditError(null);
    } catch (err) {
      setAuditError(toAdminErrorMessage(err, "Failed to load audit log"));
    }
  }, [auditLimit, auditPage]);

  const loadMetrics = useCallback(async () => {
    try {
      const result = await loadAdminMetrics();
      if (!result.supported) {
        setMetricsSupported(false);
        setMetrics(null);
        return;
      }
      setMetricsSupported(true);
      setMetrics(result.metrics);
      setMetricsError(null);

      if (!result.metrics) {
        return;
      }

      const key = deriveAdminMetricAlertKey(result.metrics);
      if (lastMetricsKey.current !== key) {
        lastMetricsKey.current = key;
        for (const alert of deriveAdminMetricAlerts(result.metrics)) {
          addNotification(alert);
        }
      }
    } catch (err) {
      setMetricsError(toAdminErrorMessage(err, "Failed to load metrics"));
    }
  }, [addNotification]);

  const loadJobLogs = useCallback(async (jobId: string) => {
    try {
      const result = await loadAdminJobLogs(jobId);
      if (!result.supported) {
        setSelectedJobSupported(false);
        return;
      }
      setSelectedJobSupported(true);
      setSelectedJob(result.job);
    } catch (err) {
      setJobsError(toAdminErrorMessage(err, "Failed to load job logs"));
    }
  }, []);

  useEffect(() => {
    if (currentView === "overview" || currentView === "tenants") {
      void loadTenants();
    }
  }, [currentView, loadTenants]);

  useEffect(() => {
    if (currentView === "overview" || currentView === "recovery") {
      void loadDeadLetters();
    }
  }, [currentView, loadDeadLetters]);

  useEffect(() => {
    if (currentView === "jobs") {
      void loadJobs();
    }
  }, [currentView, loadJobs]);

  useEffect(() => {
    if (currentView === "audit") {
      void loadAuditLog();
    }
  }, [currentView, loadAuditLog]);

  useEffect(() => {
    if (currentView === "overview") {
      void loadMetrics();
    }
  }, [currentView, loadMetrics]);

  useEffect(() => {
    setTenantPage(1);
  }, [tenantPlanFilter, tenantSearch, tenantStatusFilter]);

  const { suspendedCount, provisioningCount, failedCount, activeCount } = useMemo(
    () => deriveAdminTenantCounts(tenants),
    [tenants]
  );

  const tenantTotalPages = Math.max(1, Math.ceil(tenantTotal / tenantLimit));
  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / auditLimit));

  const requeueDeadLetter = async (jobId: string) => {
    setRequeueJobId(jobId);
    try {
      const result = await requeueDeadLetterById(jobId);
      if (!result.supported) {
        setDeadLetterError("Requeue endpoint is not available on this backend.");
        return;
      }
      await loadDeadLetters();
      setDeadLetterError(null);
      addNotification({
        type: "success",
        title: "Dead-letter requeued",
        body: `Job ${jobId.slice(0, 8)} queued for retry.`,
      });
    } catch (err) {
      setDeadLetterError(toAdminErrorMessage(err, "Failed to requeue dead-letter job"));
    } finally {
      setRequeueJobId(null);
    }
  };

  const submitTenantAction = async () => {
    if (!tenantAction) return;
    if (tenantActionInput !== tenantAction.phrase) {
      setTenantsError("Confirmation phrase does not match.");
      return;
    }

    setBusyTenantId(tenantAction.tenant.id);
    setTenantsError(null);
    try {
      const reason = tenantActionReason.trim() || undefined;
      const result = await executeTenantLifecycleAction(tenantAction.type, tenantAction.tenant.id, reason);
      if (!result.supported) {
        setTenantsError(
          tenantAction.type === "suspend"
            ? "Suspend endpoint is not available on this backend."
            : "Unsuspend endpoint is not available on this backend."
        );
        return;
      }
      await loadTenants();
      setTenantAction(null);
      setTenantActionInput("");
      setTenantActionReason("");
    } catch (err) {
      setTenantsError(
        toAdminErrorMessage(err, tenantAction.type === "suspend" ? "Failed to suspend tenant" : "Failed to unsuspend tenant")
      );
    } finally {
      setBusyTenantId(null);
    }
  };

  const exportAudit = async () => {
    setAuditExportBusy(true);
    setAuditExportError(null);
    try {
      await exportAdminAuditCsv(500);
    } catch (err) {
      setAuditExportError(toAdminErrorMessage(err, "Failed to export audit log."));
    } finally {
      setAuditExportBusy(false);
    }
  };

  const issueImpersonationLink = async () => {
    const email = impersonationEmail.trim().toLowerCase();
    const reason = impersonationReason.trim();
    if (!email || !reason) {
      setImpersonationError("Provide target email and reason.");
      return;
    }
    setImpersonationBusy(true);
    setImpersonationError(null);
    try {
      const result = await issueSupportImpersonationLink(email, reason);
      if (!result.supported) {
        setImpersonationError("Impersonation endpoint is not available on this backend.");
        return;
      }
      if (!result.link) {
        setImpersonationError("Impersonation response missing link payload.");
        return;
      }
      setImpersonationLink(result.link.url);
      setImpersonationToken(result.link.token);
      addNotification({
        type: "warning",
        title: "Impersonation link issued",
        body: `Token ready for ${result.link.target_email}. Share securely and expire quickly.`,
      });
    } catch (err) {
      setImpersonationError(toAdminErrorMessage(err, "Failed to issue impersonation link."));
    } finally {
      setImpersonationBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Admin Control Center</h1>
          <p className="text-sm text-slate-300">
            Keep tenant reliability high with fast attention routing for setup delays, failures, and governance tasks.
          </p>
        </div>
        <p className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-200">
          View: {ADMIN_VIEW_DETAILS[currentView].label}
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-2">
        <div className="flex flex-wrap gap-2">
          {ADMIN_VIEWS.map((view) => (
            <a
              key={view}
              href={buildViewHref(view)}
              className={`rounded px-3 py-1.5 text-xs transition ${
                currentView === view
                  ? "border border-sky-500/60 bg-sky-500/20 text-sky-100"
                  : "border border-slate-700 bg-slate-950/70 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {ADMIN_VIEW_DETAILS[view].label}
            </a>
          ))}
        </div>
      </div>

      {currentView === "overview" ? (
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
      ) : null}

      {currentView === "overview" ? (
      <div className="rounded-xl border border-slate-700 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Platform metrics</h2>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={() => {
              void loadMetrics();
            }}
          >
            Refresh
          </button>
        </div>

        {!metricsSupported ? (
          <p className="text-sm text-slate-300">Metrics endpoint is not available on this backend.</p>
        ) : metricsError ? (
          <p className="text-sm text-red-400">{metricsError}</p>
        ) : metrics ? (
          <div className="grid gap-3 md:grid-cols-3">
            {metricCard("Total tenants", metrics.total_tenants, "All customer environments")}
            {metricCard("Active tenants", metrics.active_tenants, "Currently operational", "good")}
            {metricCard("Provisioning queue", metrics.provisioning_tenants, "Pending + provisioning", "warn")}
            {metricCard("Pending payment", metrics.pending_payment_tenants, "Awaiting payment confirmation", "warn")}
            {metricCard("Failed tenants", metrics.failed_tenants, "Needs operator action", metrics.failed_tenants ? "warn" : "default")}
            {metricCard("Dead-letter jobs", metrics.dead_letter_count, "Recovery queue depth", metrics.dead_letter_count ? "warn" : "default")}
            {metricCard("Jobs 24h", metrics.jobs_last_24h, "Activity in the last 24h")}
            {metricCard(
              "Provisioning success (7d)",
              metrics.provisioning_success_rate_7d,
              "Percent succeeded",
              metrics.provisioning_success_rate_7d < 95 ? "warn" : "good"
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-300">Loading metrics...</p>
        )}
      </div>
      ) : null}

      {currentView === "overview" ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            {metricCard("Total tenants", tenantTotal, "All managed customer environments")}
            {metricCard("Suspended", suspendedCount, "Access paused pending review", suspendedCount ? "warn" : "default")}
            {metricCard("Provisioning", provisioningCount, "Still onboarding or awaiting payment", provisioningCount ? "warn" : "default")}
            {metricCard("Failed", failedCount, "Requires immediate operator follow-up", failedCount ? "warn" : "good")}
          </div>

          <div className="rounded-xl border border-slate-700 p-4">
        <h2 className="text-lg font-semibold">Control lanes</h2>
        <p className="mt-1 text-xs text-slate-400">Jump directly into focused admin workflows.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ADMIN_VIEWS.map((view) => {
            if (view === "overview") {
              return null;
            }
            return (
              <a
                key={view}
                href={buildViewHref(view)}
                className="rounded border border-slate-700 bg-slate-950/60 p-3 text-left transition hover:border-slate-500 hover:bg-slate-900"
              >
                <p className="text-sm font-medium text-white">{ADMIN_VIEW_DETAILS[view].label}</p>
                <p className="mt-1 text-xs text-slate-300">{ADMIN_VIEW_DETAILS[view].description}</p>
                <p className="mt-2 text-[11px] text-slate-400">
                  {view === "tenants"
                    ? `${tenantTotal} tenant records`
                    : view === "recovery"
                      ? `${deadLetters.length} dead-letter jobs`
                      : view === "jobs"
                        ? "Inspect execution and logs"
                        : view === "audit"
                          ? "Review governance trail"
                          : "Issue support links"}
                </p>
              </a>
            );
          })}
        </div>
          </div>
        </>
      ) : null}

      {currentView === "jobs" ? (
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
      ) : null}

      {currentView === "tenants" ? (
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

        <div className="mb-3 grid gap-2 md:grid-cols-[1.2fr_1fr_1fr]">
          <input
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
            placeholder="Search by company, subdomain, or domain"
            value={tenantSearch}
            onChange={(event) => setTenantSearch(event.target.value)}
          />
          <select
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
            value={tenantStatusFilter}
            onChange={(event) => setTenantStatusFilter(event.target.value)}
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
            onChange={(event) => setTenantPlanFilter(event.target.value)}
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
                          onClick={() => {
                            setTenantAction({
                              type: "unsuspend",
                              tenant,
                              phrase: buildTenantActionPhrase(tenant.subdomain),
                            });
                            setTenantActionInput("");
                            setTenantActionReason("");
                            setTenantsError(null);
                          }}
                        >
                          {busyTenantId === tenant.id ? "Reactivating..." : "Unsuspend"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyTenantId === tenant.id}
                          className="rounded bg-amber-700 px-2 py-1 text-xs hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => {
                            setTenantAction({
                              type: "suspend",
                              tenant,
                              phrase: buildTenantActionPhrase(tenant.subdomain),
                            });
                            setTenantActionInput("");
                            setTenantActionReason("");
                            setTenantsError(null);
                          }}
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
              onClick={() => setTenantPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <button
              className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
              disabled={tenantPage >= tenantTotalPages}
              onClick={() => setTenantPage((prev) => Math.min(tenantTotalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      ) : null}

      {currentView === "audit" ? (
      <div className="rounded-xl border border-slate-700 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Admin audit log</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
              onClick={() => {
                void exportAudit();
              }}
              disabled={auditExportBusy}
            >
              {auditExportBusy ? "Exporting..." : "Export CSV"}
            </button>
            <button
              className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
              onClick={() => {
                void loadAuditLog();
              }}
            >
              Refresh
            </button>
          </div>
        </div>
        {auditExportError ? <p className="mb-3 text-sm text-red-400">{auditExportError}</p> : null}

        {!auditSupported ? (
          <p className="text-sm text-slate-300">Audit log endpoint is not available on this backend.</p>
        ) : auditError ? (
          <p className="text-sm text-red-400">{auditError}</p>
        ) : auditLog.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="p-2">Time</th>
                  <th className="p-2">Actor</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Resource</th>
                  <th className="p-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-700">
                    <td className="p-2 text-xs text-slate-300">{formatDate(entry.created_at)}</td>
                    <td className="p-2 text-xs text-slate-300">
                      {entry.actor_email || entry.actor_id || entry.actor_role}
                    </td>
                    <td className="p-2 text-xs">{entry.action}</td>
                    <td className="p-2 text-xs text-slate-300">
                      {entry.resource}
                      {entry.resource_id ? ` (${entry.resource_id.slice(0, 6)}...)` : ""}
                    </td>
                    <td className="p-2 text-xs text-slate-400">{entry.ip_address || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-300">No audit entries yet.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            Page {auditPage} of {auditTotalPages} • {auditTotal} events
          </span>
          <div className="flex gap-2">
            <button
              className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
              disabled={auditPage <= 1}
              onClick={() => setAuditPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <button
              className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
              disabled={auditPage >= auditTotalPages}
              onClick={() => setAuditPage((prev) => Math.min(auditTotalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      ) : null}

      {currentView === "support" ? (
      <div className="rounded-xl border border-slate-700 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Support impersonation links</h2>
          <p className="text-xs text-slate-400">Short-lived, audited access for guided troubleshooting.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-[1.2fr_1.8fr_auto]">
          <input
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
            placeholder="target-user@example.com"
            value={impersonationEmail}
            onChange={(event) => setImpersonationEmail(event.target.value)}
          />
          <input
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
            placeholder="Reason for support access"
            value={impersonationReason}
            onChange={(event) => setImpersonationReason(event.target.value)}
          />
          <button
            className="rounded border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800 disabled:opacity-60"
            onClick={() => {
              void issueImpersonationLink();
            }}
            disabled={impersonationBusy}
          >
            {impersonationBusy ? "Issuing..." : "Issue link"}
          </button>
        </div>
        {impersonationError ? <p className="mt-2 text-sm text-red-400">{impersonationError}</p> : null}
        {impersonationLink ? (
          <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
            <p className="font-semibold">Impersonation link ready</p>
            <p className="mt-1 break-all">{impersonationLink}</p>
            {impersonationToken ? <p className="mt-1 break-all text-amber-200">Token: {impersonationToken}</p> : null}
          </div>
        ) : null}
      </div>
      ) : null}

      {currentView === "recovery" ? (
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
                  <th className="p-2">Action</th>
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
                    <td className="p-2 text-xs">
                      <button
                        className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
                        disabled={requeueJobId === job.id}
                        onClick={() => {
                          void requeueDeadLetter(job.id);
                        }}
                      >
                        {requeueJobId === job.id ? "Requeueing..." : "Requeue"}
                      </button>
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
      ) : null}

      {tenantAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-white">
              {tenantAction.type === "suspend" ? "Suspend tenant" : "Unsuspend tenant"}
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              To confirm, type <span className="font-mono text-sky-200">{tenantAction.phrase}</span>.
            </p>
            <p className="mt-1 text-xs text-slate-400">{tenantAction.tenant.company_name}</p>

            <input
              className="mt-4 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={tenantActionInput}
              onChange={(event) => setTenantActionInput(event.target.value)}
              placeholder={tenantAction.phrase}
            />
            <textarea
              className="mt-3 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              rows={2}
              value={tenantActionReason}
              onChange={(event) => setTenantActionReason(event.target.value)}
              placeholder="Optional: document the reason for this action"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800"
                onClick={() => {
                  setTenantAction(null);
                  setTenantActionInput("");
                  setTenantActionReason("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-60"
                disabled={busyTenantId === tenantAction.tenant.id || tenantActionInput !== tenantAction.phrase}
                onClick={() => {
                  void submitTenantAction();
                }}
              >
                {busyTenantId === tenantAction.tenant.id
                  ? tenantAction.type === "suspend"
                    ? "Suspending..."
                    : "Reactivating..."
                  : tenantAction.type === "suspend"
                    ? "Confirm suspend"
                    : "Confirm unsuspend"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function AdminPage() {
  return <AdminConsolePage />;
}
