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
        "rounded-card-lg border p-5",
        tone === "accent" ? "border-amber-200 bg-[#fdf7ee]" : "border-amber-200/70 bg-white/80",
        className
      )}
    >
      {children}
    </article>
  );
}

