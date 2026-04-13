"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

import { getSessionRole } from "../../auth/auth";
import { WorkspaceSidebar } from "../../shell/components/WorkspaceSidebar";
import type { ShellNavSection } from "../../shell/model/nav";
import { workspaceDescriptors } from "../../shell/model/workspace";

const globalWorkspaceSection: ShellNavSection = {
  title: "Workspaces",
  description: "Primary navigation",
  items: workspaceDescriptors.map((workspace) => ({
    href: workspace.href,
    label: workspace.label,
    icon: workspace.icon,
    match: workspace.key === "tenants" ? ["/dashboard/active", "/tenants", "/dashboard/registry"] : undefined,
  })),
};

const adminWorkspaceSection: ShellNavSection = {
  title: "Admin",
  description: "Privileged operations",
  items: [
    {
      href: "/app/admin/control-overview",
      label: "Admin",
      icon: "platform",
      match: ["/app/admin", "/admin"],
    },
  ],
};

// AGENT-NOTE: Keep rail global-only per spec; deeper operational destinations remain
// accessible via workspace-local page navigation and entity subroutes.
export function DashboardNav() {
  const pathname = usePathname() ?? "/";
  const role = getSessionRole();
  const canViewAdmin = role === "admin" || role === "support";

  const sections = useMemo(() => {
    return canViewAdmin ? [globalWorkspaceSection, adminWorkspaceSection] : [globalWorkspaceSection];
  }, [canViewAdmin]);

  return (
    <WorkspaceSidebar
      overline="Workspaces"
      title="Navigation"
      caption="Switch workspaces."
      sections={sections}
      pathname={pathname}
      tone="light"
      compact
    />
  );
}
