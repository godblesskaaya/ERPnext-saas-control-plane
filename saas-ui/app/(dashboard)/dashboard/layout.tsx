import type { ReactNode } from "react";

import { DashboardNav } from "../../../domains/dashboard/components/DashboardNav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <DashboardNav />
      {children}
    </div>
  );
}
