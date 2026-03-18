import type { ReactNode } from "react";

type OnboardingNoticeTone = "success" | "error" | "warning";

const toneClasses: Record<OnboardingNoticeTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
};

interface OnboardingNoticePanelProps {
  tone: OnboardingNoticeTone;
  children: ReactNode;
  className?: string;
}

export function OnboardingNoticePanel({ tone, children, className }: OnboardingNoticePanelProps) {
  return <p className={`rounded-2xl border p-3 text-sm ${toneClasses[tone]} ${className ?? ""}`.trim()}>{children}</p>;
}
