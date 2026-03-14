"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { TenantCreateForm } from "../../components/TenantCreateForm";
import { TenantTable } from "../../components/TenantTable";
import { api, getApiErrorMessage, isSessionExpiredError, onSessionExpired } from "../../lib/api";
import type { Job, Tenant, TenantCreateResponse, UserProfile } from "../../lib/types";

const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "deleted", "canceled", "cancelled"]);

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
      const data = await api.listTenants();
      setTenants(data);
      setError(null);
      setJobsByTenant((previous) => {
        const activeTenantIds = new Set(data.map((tenant) => tenant.id));
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
  }, [handleError]);

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

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Operations dashboard</h1>
          <p className="text-sm text-slate-300">
            Keep onboarding, provisioning, and support actions moving for teams operating across Tanzania.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="#create-tenant" className="rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800">
            New workspace
          </a>
          <button
            className="rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-60"
            onClick={() => {
              void load();
            }}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh data"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-white">Attention lane</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              needsAttentionCount ? "bg-amber-500/20 text-amber-200" : "bg-emerald-500/20 text-emerald-200"
            }`}
          >
            {needsAttentionCount ? `${needsAttentionCount} item(s) need review` : "No blockers right now"}
          </span>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-slate-200 md:grid-cols-3">
          <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2">
            Failed tenants: <span className="font-semibold text-red-200">{failedTenants}</span>
          </p>
          <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2">
            Provisioning queue: <span className="font-semibold text-amber-200">{provisioningTenants}</span>
          </p>
          <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2">
            Live jobs: <span className="font-semibold text-sky-200">{activeJobs}</span>
          </p>
        </div>
      </div>

      {currentUser && !currentUser.email_verified ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-100">Email verification required</p>
              <p className="text-xs text-amber-200/90">
                Verify {currentUser.email} before creating a workspace. Check your inbox for the verification link.
              </p>
            </div>
            <button
              className="rounded border border-amber-300/40 px-3 py-1.5 text-xs text-amber-100 hover:border-amber-200 disabled:opacity-60"
              disabled={resendBusy}
              onClick={() => {
                void resendVerification();
              }}
            >
              {resendBusy ? "Sending..." : "Resend verification"}
            </button>
          </div>
          {verificationNotice ? <p className="mt-2 text-xs text-amber-100">{verificationNotice}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        {metricCard("Total workspaces", tenants.length, "All customer environments under management")}
        {metricCard("Healthy", activeTenants, "Ready for daily sales, stock, and finance activity", "good")}
        {metricCard("In setup", provisioningTenants, "Still being provisioned or awaiting payment checks", "warn")}
        {metricCard("Needs rescue", failedTenants, "Provisioning failed and requires operator action", failedTenants > 0 ? "warn" : "default")}
      </div>

      <TenantCreateForm
        onCreated={async (result: TenantCreateResponse) => {
          if (result.job) {
            setTenantJob(result.tenant.id, result.job);
          }
          await load();
        }}
      />

      {error ? <p className="rounded border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</p> : null}

      <TenantTable
        tenants={tenants}
        jobsByTenant={jobsByTenant}
        onBackup={async (id) => {
          try {
            const job = await api.backupTenant(id);
            setTenantJob(id, job);
            setError(null);
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
      />
    </section>
  );
}
