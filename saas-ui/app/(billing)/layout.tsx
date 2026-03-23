"use client";

import type { ReactNode } from "react";

import { UserShell } from "../../domains/dashboard/components/UserShell";

export default function BillingShellLayout({ children }: { children: ReactNode }) {
  return <UserShell>{children}</UserShell>;
}
