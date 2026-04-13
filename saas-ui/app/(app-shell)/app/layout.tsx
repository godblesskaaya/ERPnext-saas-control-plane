import type { ReactNode } from "react";

import { AppShell } from "./_components/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
