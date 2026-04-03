"use client";

import { usePathname } from "next/navigation";

import { WorkspaceSidebar } from "../../shell/components/WorkspaceSidebar";
import type { ShellNavSection } from "../../shell/model/nav";
import { workspaceDescriptors, workspaceLocalNavSections } from "../../shell/model/workspace";

const keyFeatureWorkspaceSections: ShellNavSection[] = workspaceLocalNavSections
  .map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.href.startsWith("/admin")),
  }))
  .filter((section) => section.items.length > 0);

const globalWorkspaceSection: ShellNavSection = {
  title: "Workspaces",
  description: "Stable global workspaces for primary operator journeys.",
  items: workspaceDescriptors.map((workspace) => ({
    href: workspace.href,
    label: workspace.label,
    hint: workspace.description,
    match: workspace.key === "tenants" ? ["/dashboard/active", "/tenants"] : undefined,
  })),
};

const sidebarSections: ShellNavSection[] = [globalWorkspaceSection, ...keyFeatureWorkspaceSections];

export function DashboardNav() {
  const pathname = usePathname() ?? "/";

  return (
    <WorkspaceSidebar
      overline="User Workspace"
      title="Workspace navigation"
      caption="Customer-facing routes only: overview, tenants, billing, support, platform, and account."
      sections={sidebarSections}
      pathname={pathname}
      tone="light"
    />
  );
}
