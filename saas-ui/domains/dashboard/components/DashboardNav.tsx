"use client";

import { usePathname } from "next/navigation";

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
    match: workspace.key === "tenants" ? ["/dashboard/active", "/tenants"] : undefined,
  })),
};

// AGENT-NOTE: Keep rail global-only per spec; deeper operational destinations remain
// accessible via workspace-local page navigation and entity subroutes.
const sidebarSections: ShellNavSection[] = [globalWorkspaceSection];

export function DashboardNav() {
  const pathname = usePathname() ?? "/";

  return (
    <WorkspaceSidebar
      overline="Workspaces"
      title="Navigation"
      caption="Switch workspaces."
      sections={sidebarSections}
      pathname={pathname}
      tone="light"
      compact
    />
  );
}
