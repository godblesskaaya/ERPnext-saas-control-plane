"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { loadAuthHealth } from "../../../../domains/auth/application/authUseCases";
import { loadAdminMetrics, toAdminErrorMessage } from "../../../../domains/admin-ops/application/adminUseCases";
import type { MetricsSummary } from "../../../../domains/shared/lib/types";

function metricCard(label: string, value: number | string, hint: string, tone: "default" | "warn" = "default") {
  const toneClass =
    tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-900";

  return (
    <article className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{hint}</p>
    </article>
  );
}

export default function SupportOverviewPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [authHealth, setAuthHealth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [metricsResult, authResult] = await Promise.all([loadAdminMetrics(), loadAuthHealth()]);
      if (metricsResult.supported) {
        setMetrics(metricsResult.metrics);
      } else {
        setError("Support metrics are not enabled on this backend.");
      }
      setAuthHealth(authResult.message ?? "ok");
    } catch (err) {
      setError(toAdminErrorMessage(err, "Failed to load support metrics."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-amber-200/70 bg-white/80 p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Support overview</p>
          <h1 className="text-3xl font-semibold text-slate-900">Support readiness dashboard</h1>
          <p className="text-sm text-slate-600">
            Track support load, escalations, and SLA risks across Tanzania customer operations.
          </p>
        </div>
        <button
          className="rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-amber-300 disabled:opacity-60"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh metrics"}
        </button>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {metrics ? (
        <div className="grid gap-3 md:grid-cols-4">
          {metricCard("Open incidents", metrics.failed_tenants, "System failures requiring intervention", "warn")}
          {metricCard("Suspended accounts", metrics.suspended_tenants, "Billing or admin suspensions", "warn")}
          {metricCard("Provisioning queue", metrics.provisioning_tenants, "Still deploying or upgrading")}
          {metricCard("Pending payments", metrics.pending_payment_tenants, "Waiting for payment confirmation", "warn")}
          {metricCard("Open support notes", metrics.support_open_notes, "Active cases still open", "warn")}
          {metricCard("SLA breached", metrics.support_breached_notes, "Past due support notes", "warn")}
          {metricCard("Due in 24h", metrics.support_due_soon_notes, "Upcoming SLA deadlines", "warn")}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="text-xs uppercase tracking-wide text-slate-500">Auth health</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{authHealth ?? "Checking..."}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
          <p className="text-sm font-semibold text-slate-900">Support queues</p>
          <p className="mt-2 text-sm text-slate-600">
            Jump directly into the queue that needs attention. Prioritize failed provisioning first, then suspensions and
            billing follow-ups.
          </p>
          <div className="mt-4 grid gap-2 text-sm">
            <Link href="/dashboard/incidents" className="rounded-2xl border border-amber-200 bg-white px-4 py-3">
              Failed provisioning (Incidents)
            </Link>
            <Link href="/dashboard/suspensions" className="rounded-2xl border border-amber-200 bg-white px-4 py-3">
              Account suspensions
            </Link>
            <Link href="/dashboard/billing" className="rounded-2xl border border-amber-200 bg-white px-4 py-3">
              Billing follow-ups
            </Link>
            <Link href="/dashboard/support" className="rounded-2xl border border-amber-200 bg-[#fff7ed] px-4 py-3">
              Support queue (all escalations)
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
          <p className="text-sm font-semibold text-slate-900">SLA guidance</p>
          <ul className="mt-3 space-y-3 text-sm text-slate-700">
            <li className="rounded-2xl border border-amber-200/70 bg-[#fdf7ee] p-3">
              ✅ Always assign a primary owner for each escalation.
            </li>
            <li className="rounded-2xl border border-amber-200/70 bg-white p-3">
              ✅ Confirm contact path (phone, WhatsApp, or email) for the tenant.
            </li>
            <li className="rounded-2xl border border-amber-200/70 bg-white p-3">
              ⏳ Track promised resolution time and handoff notes.
            </li>
            <li className="rounded-2xl border border-amber-200/70 bg-white p-3">
              ⏳ Escalate to engineering for provisioning failures &gt; 2 hours.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
