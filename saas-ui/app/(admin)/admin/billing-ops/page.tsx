"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  loadBillingDunningQueue,
  queueBillingDunningCycle,
  toAdminErrorMessage,
} from "../../../../domains/admin-ops/application/adminUseCases";
import type { DunningItem } from "../../../../domains/shared/lib/types";

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("suspended")) return "bg-red-100 text-red-700";
  if (normalized.includes("pending")) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function BillingOpsPage() {
  const [tenants, setTenants] = useState<DunningItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningCycle, setRunningCycle] = useState(false);
  const [cycleNotice, setCycleNotice] = useState<string | null>(null);
  const [cycleError, setCycleError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadBillingDunningQueue();
      if (result.supported) {
        setTenants(result.data);
      } else {
        setError("Billing dunning endpoint is not enabled on this backend.");
      }
    } catch (err) {
      setError(toAdminErrorMessage(err, "Failed to load billing operations."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runCycle = async (dryRun = false) => {
    setRunningCycle(true);
    setCycleNotice(null);
    setCycleError(null);
    try {
      const result = await queueBillingDunningCycle(dryRun);
      if (!result.supported) {
        setCycleError("Dunning cycle endpoint is not enabled on this backend.");
        return;
      }
      setCycleNotice(result.message || "Dunning cycle queued.");
      await load();
    } catch (err) {
      setCycleError(toAdminErrorMessage(err, "Failed to queue dunning cycle."));
    } finally {
      setRunningCycle(false);
    }
  };

  const pendingCount = useMemo(
    () => tenants.filter((tenant) => tenant.status === "pending_payment").length,
    [tenants]
  );
  const suspendedCount = useMemo(
    () => tenants.filter((tenant) => tenant.status === "suspended_billing").length,
    [tenants]
  );
  const pastDueCount = useMemo(
    () =>
      tenants.filter((tenant) =>
        ["failed", "past_due", "unpaid", "cancelled"].includes(tenant.billing_status?.toLowerCase() ?? "")
      ).length,
    [tenants]
  );

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-amber-200/70 bg-white/80 p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Billing operations</p>
          <h1 className="text-3xl font-semibold text-slate-900">Dunning queue</h1>
          <p className="text-sm text-slate-600">
            Track overdue subscriptions, pending payment confirmations, and billing suspensions.
          </p>
        </div>
        <button
          className="rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-amber-300 disabled:opacity-60"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh data"}
        </button>
        <button
          className="rounded-full border border-slate-300 bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          onClick={() => {
            void runCycle(false);
          }}
          disabled={runningCycle}
        >
          {runningCycle ? "Queuing..." : "Run dunning cycle"}
        </button>
        <button
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-60"
          onClick={() => {
            void runCycle(true);
          }}
          disabled={runningCycle}
        >
          Dry run
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="text-xs uppercase tracking-wide opacity-80">Pending payment</p>
          <p className="mt-1 text-2xl font-semibold">{pendingCount}</p>
          <p className="mt-1 text-xs opacity-80">Waiting for checkout confirmation</p>
        </article>
        <article className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="text-xs uppercase tracking-wide opacity-80">Suspended (billing)</p>
          <p className="mt-1 text-2xl font-semibold">{suspendedCount}</p>
          <p className="mt-1 text-xs opacity-80">Service paused for non-payment</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Past due</p>
          <p className="mt-1 text-2xl font-semibold">{pastDueCount}</p>
          <p className="mt-1 text-xs text-slate-500">Failed or overdue invoices</p>
        </article>
      </div>

      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Billing follow-up list</p>
            <p className="text-xs text-slate-500">Use tenant detail to contact, retry, or update billing.</p>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {cycleNotice ? <p className="mt-3 text-sm text-emerald-700">{cycleNotice}</p> : null}
        {cycleError ? <p className="mt-3 text-sm text-red-600">{cycleError}</p> : null}

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-2 text-left">Tenant</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Billing status</th>
                <th className="p-2 text-left">Payment channel</th>
                <th className="p-2 text-left">Last invoice</th>
                <th className="p-2 text-left">Last attempt</th>
                <th className="p-2 text-left">Next retry</th>
                <th className="p-2 text-left">Grace ends</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 ? (
                <tr>
                  <td className="p-3 text-sm text-slate-500" colSpan={9}>
                    {loading ? "Loading billing queue..." : "No billing escalations right now."}
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => (
                  <tr key={tenant.tenant_id} className="border-t border-slate-200">
                    <td className="p-2 text-xs text-slate-700">
                      <Link href={`/tenants/${tenant.tenant_id}`} className="font-semibold text-[#0d6a6a] hover:text-[#0b5a5a]">
                        {tenant.tenant_name}
                      </Link>
                      <p className="text-[11px] text-slate-500">{tenant.domain}</p>
                    </td>
                    <td className="p-2 text-xs">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(tenant.status)}`}>
                        {tenant.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="p-2 text-xs text-slate-600">{tenant.billing_status ?? "—"}</td>
                    <td className="p-2 text-xs text-slate-600">{tenant.payment_channel ?? "—"}</td>
                    <td className="p-2 text-xs text-slate-600">{tenant.last_invoice_id ?? "—"}</td>
                    <td className="p-2 text-xs text-slate-600">{formatDateTime(tenant.last_payment_attempt)}</td>
                    <td className="p-2 text-xs text-slate-600">{formatDateTime(tenant.next_retry_at)}</td>
                    <td className="p-2 text-xs text-slate-600">{formatDateTime(tenant.grace_ends_at)}</td>
                    <td className="p-2 text-xs">
                      <Link
                        href={`/tenants/${tenant.tenant_id}#support`}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-amber-200 hover:bg-amber-50"
                      >
                        Add note
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Automated cycle is active. Use dry run before major billing state interventions.
        </p>
      </div>
    </section>
  );
}
