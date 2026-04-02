"use client";

import { usePathname } from "next/navigation";

import { getDashboardNavSectionsByMode } from "../domain/navigation";
import { WorkspaceSidebar } from "../../shell/components/WorkspaceSidebar";
import type { ShellNavSection } from "../../shell/model/nav";
import { workspaceDescriptors } from "../../shell/model/workspace";

const workspaceSections = getDashboardNavSectionsByMode("workspace");
const keyWorkspaceRoutes = new Set([
  "/dashboard/overview",
  "/dashboard/registry",
  "/dashboard/active",
  "/dashboard/onboarding",
  "/dashboard/provisioning",
  "/dashboard/incidents",
  "/dashboard/suspensions",
  "/dashboard/support",
  "/dashboard/billing-recovery",
  "/billing",
  "/dashboard/billing-details",
  "/dashboard/account",
  "/dashboard/settings",
]);

const keyFeatureWorkspaceSections: ShellNavSection[] = workspaceSections
  .map((section) => ({
    title: section.title,
    description: section.description,
    items: section.items.filter((item) => keyWorkspaceRoutes.has(item.href) && !item.href.startsWith("/admin")),
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
      caption="Customer-facing routes only: queues, workspaces, billing, account, and settings."
      sections={sidebarSections}
      pathname={pathname}
      tone="light"
    />
  );
}
