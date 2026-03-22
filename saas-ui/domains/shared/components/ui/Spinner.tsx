import { cn } from "../../lib/cn";

type SpinnerSize = "sm" | "md" | "lg";

const sizeClass: Record<SpinnerSize, string> = {
  sm: "h-3.5 w-3.5 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-8 w-8 border-[3px]",
};

export function Spinner({ size = "md", className }: { size?: SpinnerSize; className?: string }) {
  return <span className={cn("inline-block animate-spin rounded-full border-slate-300 border-t-brand-primary", sizeClass[size], className)} />;
}

