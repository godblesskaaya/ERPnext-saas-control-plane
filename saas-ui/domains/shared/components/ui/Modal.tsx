"use client";

import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        className={cn("relative z-10 w-full max-w-lg rounded-card-lg border border-amber-200 bg-white p-5 shadow-card")}
      >
        <header className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-pill px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </header>
        <div className="space-y-3 text-sm text-slate-700">{children}</div>
        {footer ? <footer className="mt-4 flex justify-end gap-2">{footer}</footer> : null}
      </section>
    </div>
  );
}

