"use client";

import { useMemo } from "react";

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
    price: "$49/mo",
    description: "Fast launch for single-team operations.",
    backupRetention: "7-day backups",
    controlTag: "Essential controls",
  },
  {
    id: "business",
    label: "Business",
    price: "$149/mo",
    description: "Flexible app-first deployment for growing teams.",
    backupRetention: "30-day backups",
    highlight: "Most popular",
    controlTag: "Advanced controls",
  },
  {
    id: "enterprise",
    label: "Enterprise",
    price: "Custom",
    description: "Multi-app rollout, enterprise policies, and guided scale.",
    backupRetention: "90-day backups",
    controlTag: "Full control plane",
  },
];

export const BUSINESS_APP_OPTIONS: BusinessAppOption[] = [
  {
    id: "erpnext",
    label: "ERPNext Core",
    description: "Accounting, stock, buying, selling, and manufacturing baselines.",
    profile: "General operations",
  },
  {
    id: "crm",
    label: "CRM",
    description: "Pipeline and account ownership for commercial teams.",
    profile: "Sales-led",
  },
  {
    id: "hrms",
    label: "HRMS",
    description: "Attendance, payroll, onboarding, and employee lifecycle.",
    profile: "People ops",
  },
  {
    id: "helpdesk",
    label: "Helpdesk",
    description: "Ticket routing and customer support queues.",
    profile: "Support first",
  },
  {
    id: "lending",
    label: "Lending",
    description: "Credit workflows, repayment schedules, and approvals.",
    profile: "Financial services",
  },
  {
    id: "payments",
    label: "Payments",
    description: "Collection tracking and payment operations workflows.",
    profile: "FinOps",
  },
];

export function getPlanMeta(plan: string): PlanOption | undefined {
  return PLAN_OPTIONS.find((option) => option.id.toLowerCase() === plan.toLowerCase());
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  chosenApp?: string;
  onChosenAppChange?: (value: string) => void;
};

export function PlanSelector({ value, onChange, chosenApp, onChosenAppChange }: Props) {
  const isBusinessSelected = value.toLowerCase() === "business";

  const selectedApp = useMemo(() => {
    if (!chosenApp) return BUSINESS_APP_OPTIONS[0];
    return BUSINESS_APP_OPTIONS.find((option) => option.id === chosenApp) ?? BUSINESS_APP_OPTIONS[0];
  }, [chosenApp]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-200">Plan</p>
        <div className="grid gap-3 md:grid-cols-3">
          {PLAN_OPTIONS.map((plan) => {
            const active = plan.id === value;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => onChange(plan.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  active
                    ? "border-sky-400 bg-sky-500/10 shadow-[0_0_0_1px_rgba(56,189,248,0.45)]"
                    : "border-slate-700 bg-slate-900/80 hover:border-slate-500"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{plan.label}</span>
                  {plan.highlight ? (
                    <span className="rounded-full border border-sky-400/40 bg-sky-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sky-200">
                      {plan.highlight}
                    </span>
                  ) : null}
                </div>
                <p className="text-base font-semibold text-sky-200">{plan.price}</p>
                <p className="mt-1 text-xs text-slate-300">{plan.description}</p>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{plan.backupRetention}</span>
                  <span>{plan.controlTag}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {isBusinessSelected ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Business app profile</p>
              <p className="text-xs text-slate-400">Choose the primary app installed for this Business tenant.</p>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-200">Required for Business</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {BUSINESS_APP_OPTIONS.map((option) => {
              const active = selectedApp.id === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChosenAppChange?.(option.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    active ? "border-emerald-400 bg-emerald-500/10" : "border-slate-700 bg-slate-950/50 hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{option.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{option.profile}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
