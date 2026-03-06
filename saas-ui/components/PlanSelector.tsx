"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const plans = ["starter", "business", "enterprise"];

export function PlanSelector({ value, onChange }: Props) {
  return (
    <select
      className="rounded border border-slate-600 bg-slate-900 p-2"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {plans.map((plan) => (
        <option key={plan} value={plan}>
          {plan}
        </option>
      ))}
    </select>
  );
}
