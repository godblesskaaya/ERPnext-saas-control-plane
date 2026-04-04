import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export function Card({
  children,
  className,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "accent";
}) {
  return (
    <article
      className={cn(
        "rounded-card-md border p-5",
        tone === "accent" ? "border-sky-200 bg-sky-50/60" : "border-slate-200 bg-white",
        className
      )}
    >
      {children}
    </article>
  );
}
