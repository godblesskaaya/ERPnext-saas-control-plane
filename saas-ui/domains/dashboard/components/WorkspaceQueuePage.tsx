"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { TenantCreateForm } from "./TenantCreateForm";
import { TenantTable } from "./TenantTable";
import { useNotifications } from "../../shared/components/NotificationsProvider";
import type { Job, Tenant, TenantCreateResponse, UserProfile } from "../../shared/lib/types";
import {
  deriveWorkspaceQueueSnapshot,
  isWorkspaceQueueSessionExpired,
  loadWorkspaceCurrentUserProfile,
  loadWorkspaceBillingPortal,
  loadWorkspaceQueue,
  onWorkspaceSessionExpired,
  queueWorkspaceBackup,
  queueWorkspaceTenantDelete,
  resendWorkspaceVerificationEmail,
  resetWorkspaceTenantAdminPassword,
  retryWorkspaceProvisioning,
  toWorkspaceQueueErrorMessage,
  updateWorkspaceTenantPlan,
} from "../../tenant-ops/application/workspaceQueueUseCases";

const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "deleted", "canceled", "cancelled"]);

type QueueConfig = {
  title: string;
  description: string;
  routeScope?: "workspace" | "admin";
  statusFilter?: string[];
  billingFilter?: string[];
  billingFilterMode?: "and" | "or";
  paymentChannelFilter?: string[];
  handoffLinks?: { label: string; href: string }[];
  callout?: { title: string; body: string; tone?: "default" | "warn" };
  extraContent?: ReactNode;
  showCreate?: boolean;
  showMetrics?: boolean;
  showAttention?: boolean;
  showActionCenter?: boolean;
  showBillingAlert?: boolean;
  showStatusFilter?: boolean;
  attentionNote?: string;
  emptyStateTitle?: string;
  emptyStateBody?: string;
  emptyStateActionLabel?: string;
  emptyStateActionHref?: string;
};

function metricCard(label: string, value: number, hint: string, tone: "default" | "good" | "warn" = "default") {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-white text-slate-900";

  return (
    <article className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{hint}</p>
    </article>
  );
}

export function WorkspaceQueuePage({
  title,
  description,
  routeScope = "workspace",
  statusFilter,
  billingFilter,
  billingFilterMode = "and",
  paymentChannelFilter,
  handoffLinks,
  callout,
  extraContent,
  showCreate = false,
  showMetrics = true,
  showAttention = false,
  showActionCenter = false,
  showBillingAlert = false,
  showStatusFilter = true,
  attentionNote,
  emptyStateTitle,
  emptyStateBody,
  emptyStateActionLabel,
  emptyStateActionHref,
}: QueueConfig) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [metricsTenants, setMetricsTenants] = useState<Tenant[]>([]);
  const [jobsByTenant, setJobsByTenant] = useState<Record<string, Job | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [retryingTenantId, setRetryingTenantId] = useState<string | null>(null);
  const [statusFilterValue, setStatusFilterValue] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [billingPortalUrl, setBillingPortalUrl] = useState<string | null>(null);
  const [billingPortalError, setBillingPortalError] = useState<string | null>(null);
  const { addNotification } = useNotifications();
  const [updatingTenantId, setUpdatingTenantId] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleError = useCallback(
    (err: unknown, fallback: string) => {
      if (isWorkspaceQueueSessionExpired(err)) {
        setError("Session expired. Please log in again.");
        router.push("/login?reason=session-expired");
        return;
      }
      setError(toWorkspaceQueueErrorMessage(err, fallback));
    },
    [router]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const queue = await loadWorkspaceQueue({
        page,
        limit,
        showStatusFilter,
        statusFilter,
        statusFilterValue,
        search,
        planFilter,
        billingFilter,
        paymentChannelFilter,
        billingFilterMode,
      });
      setTenants(queue.visibleTenants);
      setMetricsTenants(queue.metricsTenants);
      setTotal(queue.total);
      if (queue.page !== page) {
        setPage(queue.page);
      }
      setError(null);
      setLastUpdated(new Date());
      setJobsByTenant((previous) => {
        const activeTenantIds = new Set(queue.visibleTenants.map((tenant) => tenant.id));
        const next: Record<string, Job | undefined> = {};
        for (const [tenantId, job] of Object.entries(previous)) {
          if (activeTenantIds.has(tenantId)) {
            next[tenantId] = job;
          }
        }
        return next;
      });
    } catch (err) {
      handleError(err, "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, [
    billingFilter,
    billingFilterMode,
    handleError,
    limit,
    page,
    paymentChannelFilter,
    planFilter,
    search,
    showStatusFilter,
    statusFilter,
    statusFilterValue,
  ]);

  const loadCurrentUser = useCallback(async () => {
    try {
      const user = await loadWorkspaceCurrentUserProfile();
      setCurrentUser(user);
      if (user.email_verified) {
        setVerificationNotice(null);
      }
    } catch (err) {
      handleError(err, "Failed to load profile");
    }
  }, [handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    setPage(1);
  }, [billingFilter, billingFilterMode, paymentChannelFilter, planFilter, search, statusFilter, statusFilterValue]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!showStatusFilter && statusFilter && statusFilter.length === 1) {
      setStatusFilterValue(statusFilter[0]);
    }
  }, [showStatusFilter, statusFilter]);

  useEffect(() => {
    if (searchParams.get("verifyEmail") === "1") {
      setVerificationNotice("Please verify your email to unlock tenant creation.");
    }
  }, [searchParams]);

  useEffect(() => {
    return onWorkspaceSessionExpired(() => {
      setError("Session expired. Please log in again.");
      router.push("/login?reason=session-expired");
    });
  }, [router]);

  const activeJobs = useMemo(
    () => Object.values(jobsByTenant).filter((job): job is Job => Boolean(job)).length,
    [jobsByTenant]
  );

  const queueSnapshot = useMemo(() => deriveWorkspaceQueueSnapshot(metricsTenants, activeJobs), [activeJobs, metricsTenants]);
  const {
    totalTenants,
    activeTenants,
    pendingPaymentTenants,
    provisioningQueueTenants,
    provisioningTenants,
    failedTenants,
    billingQueueCount,
    suspendedTenants,
    needsAttentionCount,
  } = queueSnapshot;
  const pagedTenants = tenants;
  const lastUpdatedLabel = lastUpdated ? lastUpdated.toLocaleString() : "Not refreshed yet";
  const attentionSummary =
    attentionNote ??
    (needsAttentionCount === 0
      ? "All clear. No provisioning blockers right now."
      : `${needsAttentionCount} item(s) need attention in your queue.`);
  const isAdminScope = routeScope === "admin";
  const billingFollowUpHref = isAdminScope ? "/admin/billing" : "/billing";
  const billingFollowUpLabel = isAdminScope ? "Go to billing follow-ups" : "Open payment center";
  const statusOptions = isAdminScope
    ? [
        ["all", "All statuses"],
        ["active", "Active"],
        ["pending_payment", "Pending payment"],
        ["pending", "Pending"],
        ["provisioning", "Provisioning"],
        ["failed", "Failed"],
        ["suspended", "Suspended (all)"],
        ["suspended_admin", "Suspended (admin)"],
        ["suspended_billing", "Suspended (billing)"],
        ["upgrading", "Upgrading"],
        ["restoring", "Restoring"],
        ["pending_deletion", "Pending deletion"],
      ]
    : [
        ["all", "All statuses"],
        ["active", "Active"],
        ["pending_payment", "Pending payment"],
        ["pending", "Pending"],
        ["provisioning", "Provisioning"],
        ["failed", "Failed"],
        ["suspended", "Suspended"],
        ["upgrading", "Upgrading"],
        ["restoring", "Restoring"],
      ];

  const actionCenterCards = useMemo(() => {
    if (isAdminScope) {
      return [
        {
          href: "/admin/onboarding",
          eyebrow: "Payment confirmation",
          value: pendingPaymentTenants,
          description: "Sign-ups waiting for payment confirmation.",
          valueClassName: "text-amber-800",
          className: "bg-[#fff7ed]",
        },
        {
          href: "/admin/provisioning",
          eyebrow: "Provisioning queue",
          value: provisioningQueueTenants,
          description: "Deployments and upgrades still in progress.",
        },
        {
          href: "/admin/incidents",
          eyebrow: "System failures",
          value: failedTenants,
          description: "Provisioning failures needing operator action.",
          valueClassName: "text-red-700",
        },
        {
          href: "/admin/suspensions",
          eyebrow: "Account suspensions",
          value: suspendedTenants,
          description: "Admin or billing suspensions to review.",
        },
        {
          href: "/admin/billing",
          eyebrow: "Billing follow-ups",
          value: billingQueueCount,
          description: "Pending payments and failed billing workspaces.",
          className: "bg-[#f7fbf9]",
        },
      ];
    }

    return [
      {
        href: "/billing",
        eyebrow: "Payments",
        value: pendingPaymentTenants,
        description: "Resume checkout and review unpaid invoices.",
        valueClassName: "text-amber-800",
        className: "bg-[#fff7ed]",
      },
      {
        href: "/dashboard/registry",
        eyebrow: "Tenant registry",
        value: totalTenants,
        description: "Search all workspaces and open tenant detail.",
      },
      {
        href: "/dashboard/active",
        eyebrow: "Active workspaces",
        value: activeTenants,
        description: "Monitor live customers and continue routine actions.",
      },
      {
        href: "/onboarding",
        eyebrow: "Onboarding",
        value: provisioningTenants,
        description: "Track setup progress for newly created workspaces.",
      },
    ];
  }, [
    activeTenants,
    billingQueueCount,
    failedTenants,
    isAdminScope,
    pendingPaymentTenants,
    provisioningQueueTenants,
    provisioningTenants,
    suspendedTenants,
    totalTenants,
  ]);

  const setTenantJob = (tenantId: string, job: Job) => {
    setJobsByTenant((previous) => ({ ...previous, [tenantId]: job }));
  };

  const resendVerification = async () => {
    setResendBusy(true);
    try {
      const result = await resendWorkspaceVerificationEmail();
      setVerificationNotice(result.message || "Verification email sent. Check your inbox.");
    } catch (err) {
      setVerificationNotice(toWorkspaceQueueErrorMessage(err, "Failed to resend verification email."));
    } finally {
      setResendBusy(false);
    }
  };

  const retryProvisioning = async (tenantId: string) => {
    setRetryingTenantId(tenantId);
    try {
      const result = await retryWorkspaceProvisioning(tenantId);
      if (!result.supported) {
        setError("Retry endpoint is not available on this backend.");
        return;
      }
      setTenantJob(tenantId, result.data);
      addNotification({
        type: "success",
        title: "Provisioning retried",
        body: "A new provisioning job has been queued.",
      });
      await load();
    } catch (err) {
      setError(toWorkspaceQueueErrorMessage(err, "Failed to retry provisioning."));
    } finally {
      setRetryingTenantId(null);
    }
  };

  const updateTenantPlan = async (tenantId: string, payload: { plan: string; chosen_app?: string }) => {
    setUpdatingTenantId(tenantId);
    try {
      const result = await updateWorkspaceTenantPlan(tenantId, payload);
      if (!result.supported) {
        setError("Plan update is not available on this backend.");
        return;
      }
      setTenants((prev) => prev.map((tenant) => (tenant.id === tenantId ? result.data : tenant)));
      setMetricsTenants((prev) => prev.map((tenant) => (tenant.id === tenantId ? result.data : tenant)));
      addNotification({
        type: "success",
        title: "Plan updated",
        body: `Workspace ${result.data.domain} is now on ${result.data.plan}.`,
      });
    } catch (err) {
      setError(toWorkspaceQueueErrorMessage(err, "Failed to update plan."));
    } finally {
      setUpdatingTenantId(null);
    }
  };

  const canCreateTenants = !currentUser || currentUser.email_verified;

  const loadBillingPortal = async () => {
    setBillingPortalError(null);
    try {
      const result = await loadWorkspaceBillingPortal();
      if (!result.supported) {
        setBillingPortalError("Billing portal is not available on this backend.");
        return;
      }
      setBillingPortalUrl(result.data.url);
      addNotification({
        type: "info",
        title: "Billing workspace ready",
        body: "A billing workspace link is ready to open in a new tab.",
      });
    } catch (err) {
      setBillingPortalError(toWorkspaceQueueErrorMessage(err, "Unable to open billing portal."));
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-amber-200/70 bg-white/80 p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Operations</p>
          <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showCreate ? (
            <a href="#create-tenant" className="rounded-full bg-[#0d6a6a] px-4 py-2 text-xs font-semibold text-white">
              New workspace
            </a>
          ) : null}
          <button
            className="rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-amber-300 disabled:opacity-60"
            onClick={() => {
              void load();
            }}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh data"}
          </button>
        </div>
      </div>

      {showAttention ? (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Attention queue</p>
              <span
                className={`rounded-full px-3 py-1 text-xs ${
                  needsAttentionCount ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {needsAttentionCount ? `${needsAttentionCount} item(s) need review` : "No blockers right now"}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{attentionSummary}</p>
            <div className="mt-4 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
              <p className="rounded-xl border border-amber-200/70 bg-[#fff7ed] px-3 py-2">
                Failed workspaces: <span className="font-semibold text-amber-800">{failedTenants}</span>
              </p>
              <p className="rounded-xl border border-amber-200/70 bg-[#fff7ed] px-3 py-2">
                Provisioning queue: <span className="font-semibold text-amber-800">{provisioningTenants}</span>
              </p>
              <p className="rounded-xl border border-amber-200/70 bg-[#f7fbf9] px-3 py-2">
                Live jobs: <span className="font-semibold text-[#0d6a6a]">{activeJobs}</span>
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
            <p className="text-sm font-semibold text-slate-900">{isAdminScope ? "Ops pulse" : "Workspace pulse"}</p>
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              <div className="rounded-xl border border-amber-200/70 bg-[#fdf7ee] p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Last refresh</p>
                <p className="text-sm font-semibold text-slate-900">{lastUpdatedLabel}</p>
              </div>
              <div className="rounded-xl border border-amber-200/70 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Coverage note</p>
                <p className="text-sm text-slate-600">
                  {isAdminScope
                    ? "Designed for branch teams running on laptop + phone across Tanzania."
                    : "Designed for customer teams running sales, finance, and stock workflows across Tanzania."}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200/70 bg-[#f7fbf9] p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Next best action</p>
                <p className="text-sm text-slate-700">
                  {needsAttentionCount > 0
                    ? isAdminScope
                      ? "Review failed or provisioning workspaces first."
                      : "Review pending payments and setup blockers first."
                    : "Audit active tenants or queue new workspaces."}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {currentUser && !currentUser.email_verified ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">Email verification required</p>
              <p className="text-xs text-amber-800">
                Verify {currentUser.email} before creating a workspace. Check your inbox for the verification link.
              </p>
            </div>
            <button
              className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:border-amber-400 disabled:opacity-60"
              disabled={resendBusy}
              onClick={() => {
                void resendVerification();
              }}
            >
              {resendBusy ? "Sending..." : "Resend verification"}
            </button>
          </div>
          {verificationNotice ? <p className="mt-2 text-xs text-amber-800">{verificationNotice}</p> : null}
        </div>
      ) : null}

      {showMetrics ? (
        <div className="grid gap-3 md:grid-cols-4">
          {metricCard("Total workspaces", totalTenants, "All customer environments under management")}
          {metricCard("Healthy", activeTenants, "Ready for daily sales, stock, and finance activity", "good")}
          {metricCard("In setup", provisioningTenants, "Still being provisioned or awaiting payment checks", "warn")}
          {metricCard(
            "Needs follow-up",
            failedTenants,
            isAdminScope ? "Provisioning failed and requires operator action" : "Provisioning failed and needs support follow-up",
            failedTenants > 0 ? "warn" : "default",
          )}
        </div>
      ) : null}

      {showActionCenter ? (
        <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Action center</p>
              <p className="text-lg font-semibold text-slate-900">
                {isAdminScope ? "Queues that need attention" : "Workspace priorities"}
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {isAdminScope ? "Inspired by AWS Health dashboards" : "Journey-first workspace routing"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {actionCenterCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className={`rounded-2xl border border-amber-200 p-4 text-sm ${card.className ?? "bg-white"}`}
              >
                <p className="text-xs uppercase tracking-wide text-slate-500">{card.eyebrow}</p>
                <p className={`mt-1 text-2xl font-semibold ${card.valueClassName ?? "text-slate-800"}`}>{card.value}</p>
                <p className="mt-1 text-xs text-slate-600">{card.description}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {handoffLinks && handoffLinks.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl border border-amber-200/70 bg-white/80 p-4 text-sm text-slate-600">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Queue handoff</p>
          <div className="flex flex-wrap items-center gap-2">
            {handoffLinks.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-300">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {callout ? (
        <div
          className={`rounded-3xl border p-5 ${
            callout.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-amber-200/70 bg-white/80 text-slate-700"
          }`}
        >
          <p className="text-sm font-semibold">{callout.title}</p>
          <p className="mt-2 text-sm">{callout.body}</p>
        </div>
      ) : null}

      {showBillingAlert && billingQueueCount > 0 ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Billing follow-up needed</p>
          <p className="mt-1">
            {billingQueueCount} workspace(s) need payment attention (pending, suspended, or unpaid). Direct them to
            settle invoices so provisioning and upgrades can resume.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={billingFollowUpHref}
              className="rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:border-red-400"
            >
              {billingFollowUpLabel}
            </Link>
            <button
              className="rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:border-red-400"
              onClick={() => void loadBillingPortal()}
            >
              Open ERPNext billing workspace
            </button>
            {billingPortalUrl ? (
              <a
                href={billingPortalUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
              >
                Continue in ERPNext
              </a>
            ) : null}
          </div>
          {billingPortalError ? <p className="mt-2 text-xs text-red-700">{billingPortalError}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Filter workspaces</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input
              className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
              placeholder="Search by company, subdomain, or domain"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
              value={planFilter}
              onChange={(event) => setPlanFilter(event.target.value)}
            >
              <option value="all">All plans</option>
              <option value="starter">Starter</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
            {showStatusFilter ? (
              <select
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
                value={statusFilterValue}
                onChange={(event) => setStatusFilterValue(event.target.value)}
              >
                {statusOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700">
                {statusFilter?.length
                  ? `Queue: ${statusFilter.map((status) => status.replace("_", " ")).join(", ")}`
                  : "All statuses"}
              </div>
            )}
          </div>
        </div>
        <div />
      </div>

      {showCreate ? (
        <TenantCreateForm
          onCreated={async (result: TenantCreateResponse) => {
            if (result.job) {
              setTenantJob(result.tenant.id, result.job);
            }
            addNotification({
              type: "success",
              title: "Workspace requested",
              body: `Workspace ${result.tenant.domain} is queued for setup.`,
            });
            await load();
          }}
          canCreate={canCreateTenants}
          verificationNotice={verificationNotice}
          onResendVerification={resendVerification}
        />
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      {extraContent}

      <TenantTable
        tenants={pagedTenants}
        jobsByTenant={jobsByTenant}
        showPaymentChannel={Boolean(paymentChannelFilter && paymentChannelFilter.length)}
        filterLabel={
          paymentChannelFilter && paymentChannelFilter.length
            ? `Payment channel filter: ${paymentChannelFilter.join(", ").replace(/_/g, " ")}`
            : undefined
        }
        onBackup={async (id) => {
          try {
            const job = await queueWorkspaceBackup(id);
            setTenantJob(id, job);
            setError(null);
            addNotification({
              type: "info",
              title: "Backup started",
              body: "A backup job was queued for this workspace.",
            });
            await load();
          } catch (err) {
            handleError(err, "Failed to trigger backup");
            throw err;
          }
        }}
        onResetAdminPassword={async (id, newPassword) => {
          try {
            const result = await resetWorkspaceTenantAdminPassword(id, newPassword);
            setError(null);
            addNotification({
              type: "warning",
              title: "Admin password reset",
              body: `Credentials reset for ${result.domain}. Share securely with the owner.`,
            });
            return result;
          } catch (err) {
            handleError(err, "Failed to reset admin password");
            throw err;
          }
        }}
        onDelete={async (id) => {
          try {
            const job = await queueWorkspaceTenantDelete(id);
            setTenantJob(id, job);
            setError(null);
            addNotification({
              type: "warning",
              title: "Workspace deletion queued",
              body: "Deletion has been scheduled. Monitor job logs for completion.",
            });
            await load();
          } catch (err) {
            handleError(err, "Failed to delete tenant");
            throw err;
          }
        }}
        onJobUpdate={(job) => {
          setTenantJob(job.tenant_id, job);
          if (TERMINAL_JOB_STATUSES.has(job.status.toLowerCase())) {
            void load();
          }
        }}
        onRetryProvisioning={retryProvisioning}
        retryingTenantId={retryingTenantId}
        onUpdatePlan={updateTenantPlan}
        updatingTenantId={updatingTenantId}
        emptyStateTitle={emptyStateTitle}
        emptyStateBody={emptyStateBody}
        emptyStateActionLabel={emptyStateActionLabel}
        emptyStateActionHref={emptyStateActionHref}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          Page {page} of {totalPages} • {total} workspaces
        </span>
        <div className="flex gap-2">
          <button
            className="rounded-full border border-amber-200 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </button>
          <button
            className="rounded-full border border-amber-200 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
