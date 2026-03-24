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
} from "../../../../domains/admin-ops/application/adminUseCases";
import {
  deriveAdminMetricAlertKey,
  deriveAdminMetricAlerts,
  deriveAdminTenantCounts,
} from "../../../../domains/admin-ops/domain/adminDashboard";
import { useNotifications } from "../../../../domains/shared/components/NotificationsProvider";
import type { AuditLogEntry, DeadLetterJob, Job, MetricsSummary, Tenant } from "../../../../domains/shared/lib/types";
import type { AdminControlLaneLink, TenantAdminAction } from "./adminConsoleTypes";
import {
  ADMIN_VIEW_DETAILS,
  ADMIN_VIEW_ROUTES,
  ADMIN_VIEWS,
  type AdminView,
  inferAdminViewFromPathname,
  isAdminView,
} from "./adminConsoleConfig";

type UseAdminConsoleControllerArgs = {
  forcedView?: AdminView;
};

export function useAdminConsoleController({ forcedView }: UseAdminConsoleControllerArgs) {
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

  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [metricsSupported, setMetricsSupported] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const { addNotification } = useNotifications();
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

  const requeueDeadLetter = useCallback(
    async (jobId: string) => {
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
    },
    [addNotification, loadDeadLetters]
  );

  const submitTenantAction = useCallback(async () => {
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
  }, [loadTenants, tenantAction, tenantActionInput, tenantActionReason]);

  const cancelTenantAction = useCallback(() => {
    setTenantAction(null);
    setTenantActionInput("");
    setTenantActionReason("");
  }, []);

  const exportAudit = useCallback(async () => {
    setAuditExportBusy(true);
    setAuditExportError(null);
    try {
      await exportAdminAuditCsv(500);
    } catch (err) {
      setAuditExportError(toAdminErrorMessage(err, "Failed to export audit log."));
    } finally {
      setAuditExportBusy(false);
    }
  }, []);

  const issueImpersonationLink = useCallback(async () => {
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
  }, [addNotification, impersonationEmail, impersonationReason]);

  return {
    currentView,
    buildViewHref,
    controlLaneLinks,
    activeCount,
    failedCount,
    suspendedCount,
    provisioningCount,
    tenantTotal,

    metricsSupported,
    metricsError,
    metrics,
    loadMetrics,

    jobsSupported,
    jobsError,
    jobs,
    selectedJob,
    selectedJobSupported,
    loadJobs,
    loadJobLogs,

    tenantsError,
    loadTenants,
    tenantSearch,
    setTenantSearch,
    tenantStatusFilter,
    setTenantStatusFilter,
    tenantPlanFilter,
    setTenantPlanFilter,
    tenants,
    busyTenantId,
    openTenantAction,
    tenantPage,
    setTenantPage,
    tenantTotalPages,
    tenantAction,
    tenantActionInput,
    setTenantActionInput,
    tenantActionReason,
    setTenantActionReason,
    submitTenantAction,
    cancelTenantAction,

    auditExportBusy,
    auditExportError,
    exportAudit,
    loadAuditLog,
    auditSupported,
    auditError,
    auditLog,
    auditPage,
    setAuditPage,
    auditTotalPages,
    auditTotal,

    impersonationEmail,
    setImpersonationEmail,
    impersonationReason,
    setImpersonationReason,
    impersonationBusy,
    issueImpersonationLink,
    impersonationError,
    impersonationLink,
    impersonationToken,

    deadLetterSupported,
    deadLetterError,
    deadLetters,
    requeueJobId,
    loadDeadLetters,
    requeueDeadLetter,
  };
}

