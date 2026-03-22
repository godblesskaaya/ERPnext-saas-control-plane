import type { InputHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string | null;
  hint?: string;
};

export function Input({ className, label, error, hint, id, ...rest }: Props) {
  const inputId = id ?? rest.name ?? undefined;
  return (
    <label className="block space-y-1.5">
      {label ? <span className="text-sm font-medium text-slate-800">{label}</span> : null}
      <input
        id={inputId}
        className={cn(
          "focus-ring w-full rounded-card-md border border-amber-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400",
          error ? "border-red-300 bg-red-50/40" : "",
          className
        )}
        {...rest}
      />
      {error ? <span className="text-xs text-red-700">{error}</span> : hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

