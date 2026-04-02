"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { adminNavSections } from "../domain/adminNavigation";
import { WorkspaceSidebar } from "../../shell/components/WorkspaceSidebar";
import type { ShellNavSection } from "../../shell/model/nav";

const LEGACY_ADMIN_VIEW_ROUTES: Record<string, string> = {
  overview: "/admin/control/overview",
  tenants: "/admin/control/tenants",
  jobs: "/admin/control/jobs",
  audit: "/admin/control/audit",
  support: "/admin/control/support",
  recovery: "/admin/control/recovery",
};

const sections: ShellNavSection[] = adminNavSections.map((section) => ({
  title: section.title,
  description: section.description,
  items: section.items,
}));

export function AdminNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const effectivePath = useMemo(() => {
    if (pathname !== "/admin") {
      return pathname ?? "/";
    }

    const view = searchParams.get("view");
    if (view && LEGACY_ADMIN_VIEW_ROUTES[view]) {
      return LEGACY_ADMIN_VIEW_ROUTES[view];
    }

    return "/admin/control/overview";
  }, [pathname, searchParams]);

  return (
    <WorkspaceSidebar
      overline="Admin Shell"
      title="Platform command"
      caption="Privileged features only."
      sections={sections}
      pathname={effectivePath}
      tone="dark"
    />
  );
}
