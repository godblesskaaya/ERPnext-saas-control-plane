"use client";

export type PlanOption = {
  id: string;
  label: string;
  price: string;
  description: string;
  backupRetention: string;
  highlight?: string;
};

export const PLAN_OPTIONS: PlanOption[] = [
  {
    id: "starter",
    label: "Starter",
    price: "$49/mo",
    description: "Best for small teams launching their first ERP instance.",
    backupRetention: "7-day backups",
  },
  {
    id: "business",
    label: "Business",
    price: "$149/mo",
    description: "For growing teams that need more capacity and support.",
    backupRetention: "30-day backups",
    highlight: "Most popular",
  },
  {
    id: "enterprise",
    label: "Enterprise",
    price: "Custom",
    description: "Advanced controls, SLA, and longer retention options.",
    backupRetention: "90-day backups",
  },
];

export function getPlanMeta(plan: string): PlanOption | undefined {
  return PLAN_OPTIONS.find((option) => option.id.toLowerCase() === plan.toLowerCase());
}

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function PlanSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-300">Select plan</p>
      <div className="grid gap-2 md:grid-cols-3">
        {PLAN_OPTIONS.map((plan) => {
          const active = plan.id === value;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onChange(plan.id)}
              className={`rounded border p-3 text-left transition ${
                active
                  ? "border-blue-400 bg-blue-900/30 shadow-[0_0_0_1px_rgba(96,165,250,0.4)]"
                  : "border-slate-700 bg-slate-900 hover:border-slate-500"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">{plan.label}</span>
                {plan.highlight ? (
                  <span className="rounded bg-blue-600/20 px-2 py-0.5 text-xs text-blue-300">{plan.highlight}</span>
                ) : null}
              </div>
              <p className="text-sm font-medium text-blue-200">{plan.price}</p>
              <p className="mt-1 text-xs text-slate-300">{plan.description}</p>
              <p className="mt-2 text-xs text-emerald-300">{plan.backupRetention}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
