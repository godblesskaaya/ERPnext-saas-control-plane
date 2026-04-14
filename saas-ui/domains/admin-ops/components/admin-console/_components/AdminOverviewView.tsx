"use client";

import type { MetricsSummary } from "../../../../shared/lib/types";
import type { AdminControlLaneLink } from "./adminConsoleTypes";

type AdminOverviewViewProps = {
  activeCount: number;
  failedCount: number;
  suspendedCount: number;
  provisioningCount: number;
  tenantTotal: number;
  deadLettersCount: number;
  metricsSupported: boolean;
  metricsError: string | null;
  metrics: MetricsSummary | null;
  onRefreshMetrics: () => void;
  controlLaneLinks: AdminControlLaneLink[];
};

function metricCard(label: string, value: number, hint: string, tone: "default" | "good" | "warn" = "default") {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
      ? "border-slate-500/30 bg-slate-500/10 text-sky-100"
      : "border-slate-700 bg-slate-900/70 text-slate-100";

  return (
    <article className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{hint}</p>
    </article>
  );
}

export function AdminOverviewView({
  activeCount,
  failedCount,
  suspendedCount,
  provisioningCount,
  tenantTotal,
  deadLettersCount,
  metricsSupported,
  metricsError,
  metrics,
  onRefreshMetrics,
  controlLaneLinks,
}: AdminOverviewViewProps) {
  return (
    <>
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-white">Attention lane</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              failedCount || suspendedCount || deadLettersCount ? "bg-sky-500/20 text-sky-100" : "bg-emerald-500/20 text-emerald-200"
            }`}
          >
            {failedCount || suspendedCount || deadLettersCount ? "Intervention recommended" : "Platform healthy"}
          </span>
        </div>
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
          <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-slate-300">
            Active tenants: <span className="font-semibold text-emerald-200">{activeCount}</span>
          </p>
          <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-slate-300">
            Setup queue: <span className="font-semibold text-sky-100">{provisioningCount}</span>
          </p>
          <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-slate-300">
            Failed: <span className="font-semibold text-red-200">{failedCount}</span>
          </p>
          <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-slate-300">
            Dead letters: <span className="font-semibold text-rose-200">{deadLettersCount}</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Platform metrics</h2>
          <button className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800" onClick={onRefreshMetrics}>
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
          {controlLaneLinks.map((lane) => (
            <a
              key={lane.href}
              href={lane.href}
              className="rounded border border-slate-700 bg-slate-950/60 p-3 text-left transition hover:border-slate-500 hover:bg-slate-900"
            >
              <p className="text-sm font-medium text-white">{lane.label}</p>
              <p className="mt-1 text-xs text-slate-300">{lane.description}</p>
              <p className="mt-2 text-[11px] text-slate-400">{lane.hint}</p>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
