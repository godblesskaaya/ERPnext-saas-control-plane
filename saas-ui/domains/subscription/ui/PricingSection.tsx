"use client";

import { useEffect, useState } from "react";

import { loadPublicPlanCatalog } from "../application/subscriptionUseCases";
import type { PlanCatalogItem } from "../domain/planCatalog";
import { Badge, Card, Spinner } from "../../shared/components/ui";

export function PricingSection() {
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const catalog = await loadPublicPlanCatalog();
      if (!active) return;
      const ordered = [...catalog].sort((a, b) => a.monthlyPriceTzs - b.monthlyPriceTzs);
      setPlans(ordered);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section id="pricing" className="space-y-6 rounded-3xl border border-amber-200/80 bg-white/80 p-8">
      <h2 className="font-display text-3xl text-slate-900">Pricing that makes sense locally</h2>
      <p className="max-w-3xl text-sm text-slate-600">
        Live plans from the platform API. Prices are shown in TZS first, with backup and support policies included.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-[#fdf7ee] px-4 py-3 text-sm text-slate-700">
          <Spinner size="sm" />
          Loading plans…
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} tone={plan.slug === "business" ? "accent" : "default"} className={plan.slug === "business" ? "border-brand-primary/30 shadow-card" : ""}>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{plan.label}</p>
                {plan.highlight ? <Badge tone="success">{plan.highlight}</Badge> : null}
              </div>
              <p className="text-2xl font-bold text-slate-900">{plan.monthlyPriceLabel}</p>
              <p className="text-sm text-slate-600">{plan.description}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge tone="info">{plan.backupRetentionLabel}</Badge>
                <Badge tone="default">{plan.supportLabel}</Badge>
                {plan.selectableEntitlements.length ? <Badge tone="warning">{plan.selectableEntitlements.length} selectable app(s)</Badge> : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

