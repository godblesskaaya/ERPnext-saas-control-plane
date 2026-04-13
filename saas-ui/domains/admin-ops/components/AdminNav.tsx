"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { adminNavSections } from "../domain/adminNavigation";
import { WorkspaceSidebar } from "../../shell/components/WorkspaceSidebar";
import type { ShellNavSection } from "../../shell/model/nav";

const LEGACY_ADMIN_VIEW_ROUTES: Record<string, string> = {
  overview: "/app/admin/control-overview",
  tenants: "/app/admin/tenant-control",
  jobs: "/app/admin/jobs",
  audit: "/app/admin/audit",
  support: "/app/admin/support-tools",
  recovery: "/app/admin/recovery",
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
    if (pathname !== "/admin" && pathname !== "/app/admin") {
      return pathname ?? "/";
    }

    const view = searchParams.get("view");
    if (view && LEGACY_ADMIN_VIEW_ROUTES[view]) {
      return LEGACY_ADMIN_VIEW_ROUTES[view];
    }

    return "/app/admin/control-overview";
  }, [pathname, searchParams]);

  return (
    <WorkspaceSidebar
      overline="Admin"
      title="Control"
      caption="Privileged operations."
      sections={sections}
      pathname={effectivePath}
      tone="light"
    />
  );
}
