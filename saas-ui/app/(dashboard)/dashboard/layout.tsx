import type { ReactNode } from "react";

import { DashboardNav } from "../../../domains/dashboard/components/DashboardNav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f5ef]">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <DashboardNav />
          <div className="space-y-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
