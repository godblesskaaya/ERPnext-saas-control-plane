"use client";

import { useEffect, useMemo, useState } from "react";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";
import { loadBillingFollowUpSummary } from "../../../../domains/tenant-ops/application/billingFollowUpUseCase";

export default function DashboardBillingPage() {
  const [channelFilter, setChannelFilter] = useState("all");
  const [channelCounts, setChannelCounts] = useState<Record<string, number>>({});
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [billingCounts, setBillingCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [countsError, setCountsError] = useState<string | null>(null);
  const channelFilters = useMemo(() => ["all", "mobile_money", "card", "bank_transfer", "invoice"], []);
  const channelLabel = channelFilter === "all" ? undefined : `Channel: ${channelFilter.replace("_", " ")}`;

  useEffect(() => {
    const loadCounts = async () => {
      setLoadingCounts(true);
      setCountsError(null);
      try {
        const summary = await loadBillingFollowUpSummary();
        setChannelCounts(summary.channelCounts);
        setStatusCounts(summary.statusCounts);
        setBillingCounts(summary.billingCounts);
      } catch (err) {
        setCountsError("Unable to load channel summary.");
      } finally {
        setLoadingCounts(false);
      }
    };
    void loadCounts();
  }, []);
  return (
    <WorkspaceQueuePage
      title="Billing follow-ups"
      description="Past-due, failed, and suspended billing cases."
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      statusFilter={["pending_payment", "suspended_billing"]}
      billingFilter={["failed", "past_due", "unpaid", "cancelled"]}
      billingFilterMode="or"
      paymentChannelFilter={channelFilter === "all" ? undefined : [channelFilter]}
      callout={{
        title: "Channel focus",
        body: "Use payment channel filters to quickly segment mobile money vs card follow-ups.",
        tone: "default",
      }}
      extraContent={
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-4 text-sm text-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Payment channel</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              {channelFilters.map((channel) => (
                <button
                  key={channel}
                  className={`rounded-full border px-3 py-1 ${
                    channelFilter === channel
                      ? "border-[#0d6a6a] bg-[#0d6a6a] text-white"
                      : "border-amber-200 bg-white text-slate-600 hover:border-amber-300"
                  }`}
                  onClick={() => setChannelFilter(channel)}
                >
                  {channel === "all" ? "All channels" : channel.replace("_", " ")}
                </button>
              ))}
            </div>
            {channelLabel ? <p className="mt-2 text-xs text-slate-500">Filtering by {channelLabel}.</p> : null}
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Channel summary</p>
              {countsError ? (
                <p className="mt-2 text-xs text-red-600">{countsError}</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.keys(channelCounts).length ? (
                    Object.entries(channelCounts).map(([channel, count]) => (
                      <span key={channel} className="rounded-full border border-slate-200 px-2 py-1 text-xs">
                        {channel.replace(/_/g, " ")}: <span className="font-semibold">{count}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">
                      {loadingCounts ? "Loading channels..." : "No channel data yet."}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-4 text-sm text-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Dunning checklist</p>
            <p className="mt-2 text-xs text-slate-600">
              Standardize follow-ups to reduce churn and keep provisioning moving.
            </p>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              <li className="rounded-2xl border border-amber-200/70 bg-[#fdf7ee] px-3 py-2">
                ✅ Confirm payment channel and retry status with customer.
              </li>
              <li className="rounded-2xl border border-amber-200/70 bg-white px-3 py-2">
                ✅ Re-send invoice or payment link (email + WhatsApp).
              </li>
              <li className="rounded-2xl border border-amber-200/70 bg-white px-3 py-2">
                ⏳ Apply grace period before suspending production access.
              </li>
              <li className="rounded-2xl border border-amber-200/70 bg-white px-3 py-2">
                ⏳ Capture notes in support log when actioned.
              </li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              Dunning state and retry windows are now available in Billing operations.
            </p>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current backlog</p>
              <div className="mt-2 space-y-1">
                {Object.keys(statusCounts).length ? (
                  Object.entries(statusCounts).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span>Status: {status.replace(/_/g, " ")}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No status backlog yet.</p>
                )}
                {Object.keys(billingCounts).length ? (
                  Object.entries(billingCounts).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span>Billing: {status.replace(/_/g, " ")}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))
                ) : null}
              </div>
            </div>
          </div>
        </div>
      }
      attentionNote="Resolve payment issues quickly to avoid service interruptions."
      emptyStateTitle="No billing follow-ups right now"
      emptyStateBody="All tenants have paid or are in onboarding."
      emptyStateActionLabel="View onboarding payments"
      emptyStateActionHref="/dashboard/onboarding"
    />
  );
}
