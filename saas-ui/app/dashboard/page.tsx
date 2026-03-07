"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { TenantCreateForm } from "../../components/TenantCreateForm";
import { TenantTable } from "../../components/TenantTable";
import { api, getApiErrorMessage, isSessionExpiredError, onSessionExpired } from "../../lib/api";
import type { Job, Tenant, TenantCreateResponse } from "../../lib/types";

const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "deleted", "canceled", "cancelled"]);

function metricCard(label: string, value: number, tone: "default" | "good" | "warn" = "default") {
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
    </article>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [jobsByTenant, setJobsByTenant] = useState<Record<string, Job | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    void load();
  }, [load]);

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

  const setTenantJob = (tenantId: string, job: Job) => {
    setJobsByTenant((previous) => ({ ...previous, [tenantId]: job }));
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-300">Operational overview, tenant controls, and provisioning activity.</p>
        </div>
        <div className="flex items-center gap-2">
          {activeJobs ? (
            <span className="rounded-full bg-blue-600/20 px-3 py-1 text-xs text-blue-200">
              {activeJobs} job{activeJobs === 1 ? "" : "s"} tracked live
            </span>
          ) : null}
          <button
            className="rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-60"
            onClick={() => {
              void load();
            }}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {metricCard("Total tenants", tenants.length)}
        {metricCard("Active", activeTenants, "good")}
        {metricCard("Provisioning", provisioningTenants, "warn")}
        {metricCard("Failed", failedTenants, failedTenants > 0 ? "warn" : "default")}
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
