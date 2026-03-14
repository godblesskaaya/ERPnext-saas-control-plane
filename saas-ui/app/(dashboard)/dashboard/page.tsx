"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { TenantCreateForm } from "../../../domains/dashboard/components/TenantCreateForm";
import { TenantTable } from "../../../domains/dashboard/components/TenantTable";
import { useNotifications } from "../../../domains/shared/components/NotificationsProvider";
import { api, getApiErrorMessage, isSessionExpiredError, onSessionExpired } from "../../../domains/shared/lib/api";
import type { Job, Tenant, TenantCreateResponse, UserProfile } from "../../../domains/shared/lib/types";

const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "deleted", "canceled", "cancelled"]);

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

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [billingPortalUrl, setBillingPortalUrl] = useState<string | null>(null);
  const [billingPortalError, setBillingPortalError] = useState<string | null>(null);
  const { addNotification } = useNotifications();
  const [updatingTenantId, setUpdatingTenantId] = useState<string | null>(null);

  const handleError = useCallback(
    (err: unknown, fallback: string) => {
      if (isSessionExpiredError(err)) {
        setError("Session expired. Please log in again.");
        router.push("/login?reason=session-expired");
        return;
      }
      setError(getApiErrorMessage(err, fallback));
    },
    [router]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const paged = await api.listTenantsPaged(page, limit, statusFilter === "all" ? undefined : statusFilter, search.trim());
      let nextTenants: Tenant[] = [];
      if (paged.supported) {
        nextTenants = paged.data.data;
        setTenants(nextTenants);
        setTotal(paged.data.total);
      } else {
        nextTenants = await api.listTenants();
        setTenants(nextTenants);
        setTotal(nextTenants.length);
      }
      setError(null);
      setLastUpdated(new Date());
      setJobsByTenant((previous) => {
        const activeTenantIds = new Set(nextTenants.map((tenant) => tenant.id));
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
  }, [handleError, limit, page, search, statusFilter]);

  const loadCurrentUser = useCallback(async () => {
    try {
      const user = await api.getCurrentUser();
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
    void loadCurrentUser();
  }, [load, loadCurrentUser]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (searchParams.get("verifyEmail") === "1") {
      setVerificationNotice("Please verify your email to unlock tenant creation.");
    }
  }, [searchParams]);

  useEffect(() => {
    return onSessionExpired(() => {
      setError("Session expired. Please log in again.");
      router.push("/login?reason=session-expired");
    });
  }, [router]);

  const activeJobs = useMemo(
    () => Object.values(jobsByTenant).filter((job): job is Job => Boolean(job)).length,
    [jobsByTenant]
  );

  const activeTenants = useMemo(
    () => tenants.filter((tenant) => tenant.status.toLowerCase() === "active").length,
    [tenants]
  );

  const provisioningTenants = useMemo(
    () => tenants.filter((tenant) => ["pending", "pending_payment", "provisioning"].includes(tenant.status.toLowerCase())).length,
    [tenants]
  );

  const failedTenants = useMemo(
    () => tenants.filter((tenant) => tenant.status.toLowerCase() === "failed").length,
    [tenants]
  );
  const needsAttentionCount = provisioningTenants + failedTenants + activeJobs;
  const lastUpdatedLabel = lastUpdated ? lastUpdated.toLocaleString() : "Not refreshed yet";
  const attentionSummary =
    needsAttentionCount === 0
      ? "All clear. No provisioning blockers right now."
      : `${needsAttentionCount} item(s) need attention in your queue.`;

  const setTenantJob = (tenantId: string, job: Job) => {
    setJobsByTenant((previous) => ({ ...previous, [tenantId]: job }));
  };

  const resendVerification = async () => {
    setResendBusy(true);
    try {
      const result = await api.resendVerification();
      setVerificationNotice(result.message || "Verification email sent. Check your inbox.");
    } catch (err) {
      setVerificationNotice(getApiErrorMessage(err, "Failed to resend verification email."));
    } finally {
      setResendBusy(false);
    }
  };

  const retryProvisioning = async (tenantId: string) => {
    setRetryingTenantId(tenantId);
    try {
      const result = await api.retryTenant(tenantId);
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
      setError(getApiErrorMessage(err, "Failed to retry provisioning."));
    } finally {
      setRetryingTenantId(null);
    }
  };

  const updateTenantPlan = async (tenantId: string, payload: { plan: string; chosen_app?: string }) => {
    setUpdatingTenantId(tenantId);
    try {
      const result = await api.updateTenant(tenantId, payload);
      if (!result.supported) {
        setError("Plan update is not available on this backend.");
        return;
      }
      setTenants((prev) => prev.map((tenant) => (tenant.id === tenantId ? result.data : tenant)));
      addNotification({
        type: "success",
        title: "Plan updated",
        body: `Workspace ${result.data.domain} is now on ${result.data.plan}.`,
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to update plan."));
    } finally {
      setUpdatingTenantId(null);
    }
  };

  const canCreateTenants = !currentUser || currentUser.email_verified;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const failedBillingTenants = tenants.filter((tenant) => tenant.billing_status?.toLowerCase() === "failed").length;

  const loadBillingPortal = async () => {
    setBillingPortalError(null);
    try {
      const result = await api.getBillingPortal();
      if (!result.supported) {
        setBillingPortalError("Billing portal is not available on this backend.");
        return;
      }
      setBillingPortalUrl(result.data.url);
      addNotification({
        type: "info",
        title: "Billing portal ready",
        body: "A billing portal link is ready to open in a new tab.",
      });
    } catch (err) {
      setBillingPortalError(getApiErrorMessage(err, "Unable to open billing portal."));
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-amber-200/70 bg-white/80 p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Control room</p>
          <h1 className="text-3xl font-semibold text-slate-900">Operations dashboard</h1>
          <p className="text-sm text-slate-600">
            Keep onboarding, provisioning, and support actions moving for teams operating across Tanzania.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="#create-tenant" className="rounded-full bg-[#0d6a6a] px-4 py-2 text-xs font-semibold text-white">
            New workspace
          </a>
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
          <p className="text-sm font-semibold text-slate-900">Ops pulse</p>
          <div className="mt-3 space-y-3 text-sm text-slate-600">
            <div className="rounded-xl border border-amber-200/70 bg-[#fdf7ee] p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Last refresh</p>
              <p className="text-sm font-semibold text-slate-900">{lastUpdatedLabel}</p>
            </div>
            <div className="rounded-xl border border-amber-200/70 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Coverage note</p>
              <p className="text-sm text-slate-600">
                Designed for branch teams running on laptop + phone across Tanzania.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200/70 bg-[#f7fbf9] p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Next best action</p>
              <p className="text-sm text-slate-700">
                {needsAttentionCount > 0 ? "Review failed or provisioning workspaces first." : "Create a new workspace or audit active tenants."}
              </p>
            </div>
          </div>
        </div>
      </div>

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

      <div className="grid gap-3 md:grid-cols-4">
        {metricCard("Total workspaces", total, "All customer environments under management")}
        {metricCard("Healthy", activeTenants, "Ready for daily sales, stock, and finance activity", "good")}
        {metricCard("In setup", provisioningTenants, "Still being provisioned or awaiting payment checks", "warn")}
        {metricCard("Needs rescue", failedTenants, "Provisioning failed and requires operator action", failedTenants > 0 ? "warn" : "default")}
      </div>

      {failedBillingTenants > 0 ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Payment issue detected</p>
          <p className="mt-1">
            {failedBillingTenants} workspace(s) have failed payments. Ask the owner to update billing details.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:border-red-400"
              onClick={() => void loadBillingPortal()}
            >
              Open billing portal
            </button>
            {billingPortalUrl ? (
              <a
                href={billingPortalUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
              >
                Continue in portal
              </a>
            ) : null}
          </div>
          {billingPortalError ? <p className="mt-2 text-xs text-red-700">{billingPortalError}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Filter workspaces</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
              placeholder="Search by company, subdomain, or domain"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pending_payment">Pending payment</option>
              <option value="pending">Pending</option>
              <option value="provisioning">Provisioning</option>
              <option value="failed">Failed</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>
        <div />
      </div>

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

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      <TenantTable
        tenants={tenants}
        jobsByTenant={jobsByTenant}
        onBackup={async (id) => {
          try {
            const job = await api.backupTenant(id);
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
            const result = await api.resetAdminPassword(id, newPassword);
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
            const job = await api.deleteTenant(id);
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
