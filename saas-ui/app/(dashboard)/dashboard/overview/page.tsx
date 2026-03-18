"use client";

import { useEffect, useState } from "react";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";
import { api } from "../../../../domains/shared/lib/api";

export default function DashboardOverviewPage() {
  const [authHealth, setAuthHealth] = useState("checking");
  const [billingHealth, setBillingHealth] = useState("checking");

  useEffect(() => {
    const load = async () => {
      try {
        const auth = await api.authHealth();
        if (auth.supported) {
          setAuthHealth(auth.data.message ?? "ok");
        } else {
          setAuthHealth("unsupported");
        }
      } catch {
        setAuthHealth("unavailable");
      }
      const billing = await api.billingHealth();
      if (billing.supported) {
        setBillingHealth(billing.data.message ?? "ok");
      } else {
        setBillingHealth("unsupported");
      }
    };
    void load();
  }, []);
  return (
    <WorkspaceQueuePage
      title="Operations overview"
      description="Live operations snapshot for Tanzania: payments, provisioning, and tenant health in one console."
      extraContent={
        <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-4 text-sm text-slate-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Diagnostics</p>
          <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
              API: <span className="font-semibold">ok</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
              Auth: <span className="font-semibold">{authHealth}</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
              Billing: <span className="font-semibold">{billingHealth}</span>
            </div>
          </div>
        </div>
      }
      showCreate
      showMetrics
      showAttention
      showActionCenter
      showBillingAlert
      showStatusFilter
    />
  );
}
