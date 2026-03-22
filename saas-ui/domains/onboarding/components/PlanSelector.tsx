"use client";

import { useMemo } from "react";

import type { PlanCatalogItem } from "../../subscription/domain/planCatalog";
import { Badge, Card } from "../../shared/components/ui";

export type PlanOption = {
  id: string;
  label: string;
  price: string;
  description: string;
  backupRetention: string;
  highlight?: string;
  controlTag: string;
};

export type BusinessAppOption = {
  id: string;
  label: string;
  description: string;
  profile: string;
};

export const PLAN_OPTIONS: PlanOption[] = [
  {
    id: "starter",
    label: "Starter",
    price: "TZS 125,000/month",
    description: "Best when one team needs sales, stock, and invoicing moving this week.",
    backupRetention: "7-day backups",
    controlTag: "Daily essentials",
  },
  {
    id: "business",
    label: "Business",
    price: "TZS 380,000/month",
    description: "For growing operations coordinating branches, field teams, or mobile-first workflows.",
    backupRetention: "30-day backups",
    highlight: "Best for growth",
    controlTag: "Growth controls",
  },
  {
    id: "enterprise",
    label: "Enterprise",
    price: "Custom pricing",
    description: "For complex governance, multi-company rollout, and guided migration planning.",
    backupRetention: "90-day backups",
    controlTag: "Enterprise governance",
  },
];

export const BUSINESS_APP_OPTIONS: BusinessAppOption[] = [
  {
    id: "erpnext",
    label: "Core Operations",
    description: "Track stock, purchasing, sales, and core finance in one daily workspace.",
    profile: "Operations",
  },
  {
    id: "crm",
    label: "CRM",
    description: "Keep follow-ups and deal stages clear for sales teams on the move.",
    profile: "Sales",
  },
  {
    id: "hrms",
    label: "HRMS",
    description: "Manage attendance, leave, and payroll cycles with fewer manual handoffs.",
    profile: "People",
  },
  {
    id: "helpdesk",
    label: "Helpdesk",
    description: "Route customer requests quickly so small support teams can keep SLAs visible.",
    profile: "Support",
  },
  {
    id: "lending",
    label: "Lending",
    description: "Run approvals and repayment tracking for lending operations with audit clarity.",
    profile: "Finance",
  },
  {
    id: "payments",
    label: "Payments",
    description: "Keep collections and reconciliation work structured for daily cashflow visibility.",
    profile: "Collections",
  },
];

export function getPlanMeta(plan: string): PlanOption | undefined {
  return PLAN_OPTIONS.find((option) => option.id.toLowerCase() === plan.toLowerCase());
}

export function mapPlanCatalogToOptions(catalog: PlanCatalogItem[]): PlanOption[] {
  return catalog.map((plan) => ({
    id: plan.slug,
    label: plan.label,
    price: plan.monthlyPriceLabel,
    description: plan.description,
    backupRetention: plan.backupRetentionLabel,
    highlight: plan.highlight,
    controlTag: plan.supportLabel,
  }));
}

export function mapSelectableEntitlementsToBusinessApps(
  selectableEntitlements: string[],
  fallback: BusinessAppOption[] = BUSINESS_APP_OPTIONS
): BusinessAppOption[] {
  if (!selectableEntitlements.length) return fallback;

  return selectableEntitlements.map((appSlug) => {
    const fallbackOption = fallback.find((item) => item.id === appSlug);
    if (fallbackOption) return fallbackOption;

    const label = appSlug
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return {
      id: appSlug,
      label,
      description: `${label} focus pack for business workflows.`,
      profile: "Business",
    };
  });
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  chosenApp?: string;
  onChosenAppChange?: (value: string) => void;
  planOptions?: PlanOption[];
  businessAppOptions?: BusinessAppOption[];
};

export function PlanSelector({
  value,
  onChange,
  chosenApp,
  onChosenAppChange,
  planOptions,
  businessAppOptions,
}: Props) {
  const isBusinessSelected = value.toLowerCase() === "business";
  const resolvedPlanOptions = planOptions?.length ? planOptions : PLAN_OPTIONS;
  const resolvedBusinessAppOptions = businessAppOptions?.length ? businessAppOptions : BUSINESS_APP_OPTIONS;

  const selectedApp = useMemo(() => {
    if (!chosenApp) return resolvedBusinessAppOptions[0];
    return resolvedBusinessAppOptions.find((option) => option.id === chosenApp) ?? resolvedBusinessAppOptions[0];
  }, [chosenApp, resolvedBusinessAppOptions]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900">Choose rollout level</p>
          <p className="text-xs text-slate-500">
            Pick the control depth your team needs now, then scale without changing workflows.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {resolvedPlanOptions.map((plan) => {
            const active = plan.id === value;
            return (
              <Card
                key={plan.id}
                className={`cursor-pointer text-left transition ${
                  active
                    ? "border-emerald-200 bg-emerald-50 shadow-[0_0_0_1px_rgba(13,106,106,0.2)]"
                    : "border-amber-200 bg-white/80 hover:border-amber-300"
                }`}
              >
                <button type="button" onClick={() => onChange(plan.id)} className="w-full text-left">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{plan.label}</span>
                    {plan.highlight ? <Badge tone="success">{plan.highlight}</Badge> : null}
                  </div>
                  <p className="text-base font-semibold text-[#0d6a6a]">{plan.price}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{plan.description}</p>
                  <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                    <p>{plan.backupRetention}</p>
                    <p>{plan.controlTag}</p>
                  </div>
                </button>
              </Card>
            );
          })}
        </div>
      </div>

      {isBusinessSelected ? (
        <div className="rounded-2xl border border-amber-200 bg-white/80 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-900">Business focus area</p>
              <p className="text-xs text-slate-500">
                Choose the first workflow your team needs most (sales, people, support, or finance).
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">Required</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {resolvedBusinessAppOptions.map((option) => {
              const active = selectedApp.id === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChosenAppChange?.(option.id)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    active ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-white/80 hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{option.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">{option.profile}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{option.description}</p>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Useful for Tanzania-based teams running branch and field activity primarily from mobile devices.
          </p>
        </div>
      ) : null}
    </div>
  );
}
