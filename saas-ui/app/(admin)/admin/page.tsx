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
  deriveAdminMetricAlertKey,
  deriveAdminMetricAlerts,
  deriveAdminTenantCounts,
} from "../../../domains/admin-ops/domain/adminDashboard";
import { useNotifications } from "../../../domains/shared/components/NotificationsProvider";
import type { AuditLogEntry, DeadLetterJob, Job, MetricsSummary, Tenant } from "../../../domains/shared/lib/types";
import { AdminAuditView } from "./_components/AdminAuditView";
import { AdminJobsView } from "./_components/AdminJobsView";
import { AdminOverviewView } from "./_components/AdminOverviewView";
import { AdminRecoveryView } from "./_components/AdminRecoveryView";
import { AdminSupportView } from "./_components/AdminSupportView";
import { AdminTenantsView } from "./_components/AdminTenantsView";
import { TenantActionModal } from "./_components/TenantActionModal";
import type { AdminControlLaneLink, TenantAdminAction } from "./_components/adminConsoleTypes";

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
  const controlLaneLinks = useMemo<AdminControlLaneLink[]>(
    () =>
      ADMIN_VIEWS.filter((view) => view !== "overview").map((view) => ({
        href: buildViewHref(view),
        label: ADMIN_VIEW_DETAILS[view].label,
        description: ADMIN_VIEW_DETAILS[view].description,
        hint:
          view === "tenants"
            ? `${tenantTotal} tenant records`
            : view === "recovery"
            ? `${deadLetters.length} dead-letter jobs`
            : view === "jobs"
            ? "Inspect execution and logs"
            : view === "audit"
            ? "Review governance trail"
            : "Issue support links",
      })),
    [buildViewHref, deadLetters.length, tenantTotal]
  );

  const openTenantAction = useCallback((nextAction: TenantAdminAction) => {
    setTenantAction(nextAction);
    setTenantActionInput("");
    setTenantActionReason("");
    setTenantsError(null);
  }, []);

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
        <AdminOverviewView
          activeCount={activeCount}
          failedCount={failedCount}
          suspendedCount={suspendedCount}
          provisioningCount={provisioningCount}
          tenantTotal={tenantTotal}
          deadLettersCount={deadLetters.length}
          metricsSupported={metricsSupported}
          metricsError={metricsError}
          metrics={metrics}
          onRefreshMetrics={() => {
            void loadMetrics();
          }}
          controlLaneLinks={controlLaneLinks}
        />
      ) : null}

      {currentView === "jobs" ? (
        <AdminJobsView
          jobsSupported={jobsSupported}
          jobsError={jobsError}
          jobs={jobs}
          selectedJob={selectedJob}
          selectedJobSupported={selectedJobSupported}
          onRefreshJobs={() => {
            void loadJobs();
          }}
          onInspectJobLogs={(jobId) => {
            void loadJobLogs(jobId);
          }}
        />
      ) : null}

      {currentView === "tenants" ? (
        <AdminTenantsView
          tenantsError={tenantsError}
          onRefreshTenants={() => {
            void loadTenants();
          }}
          tenantSearch={tenantSearch}
          onTenantSearchChange={setTenantSearch}
          tenantStatusFilter={tenantStatusFilter}
          onTenantStatusFilterChange={setTenantStatusFilter}
          tenantPlanFilter={tenantPlanFilter}
          onTenantPlanFilterChange={setTenantPlanFilter}
          tenants={tenants}
          busyTenantId={busyTenantId}
          onOpenTenantAction={openTenantAction}
          tenantPage={tenantPage}
          tenantTotalPages={tenantTotalPages}
          tenantTotal={tenantTotal}
          onPreviousPage={() => setTenantPage((prev) => Math.max(1, prev - 1))}
          onNextPage={() => setTenantPage((prev) => Math.min(tenantTotalPages, prev + 1))}
        />
      ) : null}

      {currentView === "audit" ? (
        <AdminAuditView
          auditExportBusy={auditExportBusy}
          auditExportError={auditExportError}
          onExportAudit={() => {
            void exportAudit();
          }}
          onRefreshAudit={() => {
            void loadAuditLog();
          }}
          auditSupported={auditSupported}
          auditError={auditError}
          auditLog={auditLog}
          auditPage={auditPage}
          auditTotalPages={auditTotalPages}
          auditTotal={auditTotal}
          onPreviousPage={() => setAuditPage((prev) => Math.max(1, prev - 1))}
          onNextPage={() => setAuditPage((prev) => Math.min(auditTotalPages, prev + 1))}
        />
      ) : null}

      {currentView === "support" ? (
        <AdminSupportView
          impersonationEmail={impersonationEmail}
          onImpersonationEmailChange={setImpersonationEmail}
          impersonationReason={impersonationReason}
          onImpersonationReasonChange={setImpersonationReason}
          impersonationBusy={impersonationBusy}
          onIssueImpersonationLink={() => {
            void issueImpersonationLink();
          }}
          impersonationError={impersonationError}
          impersonationLink={impersonationLink}
          impersonationToken={impersonationToken}
        />
      ) : null}

      {currentView === "recovery" ? (
        <AdminRecoveryView
          deadLetterSupported={deadLetterSupported}
          deadLetterError={deadLetterError}
          deadLetters={deadLetters}
          requeueJobId={requeueJobId}
          onRefreshDeadLetters={() => {
            void loadDeadLetters();
          }}
          onRequeueDeadLetter={(jobId) => {
            void requeueDeadLetter(jobId);
          }}
        />
      ) : null}

      <TenantActionModal
        tenantAction={tenantAction}
        tenantActionInput={tenantActionInput}
        onTenantActionInputChange={setTenantActionInput}
        tenantActionReason={tenantActionReason}
        onTenantActionReasonChange={setTenantActionReason}
        busyTenantId={busyTenantId}
        onCancel={() => {
          setTenantAction(null);
          setTenantActionInput("");
          setTenantActionReason("");
        }}
        onConfirm={() => {
          void submitTenantAction();
        }}
      />
    </section>
  );
}

export default function AdminPage() {
  return <AdminConsolePage />;
}
