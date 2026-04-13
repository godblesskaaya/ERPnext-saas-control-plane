"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { Alert, Box, Button, Card, CardContent, Paper, Stack, Typography } from "@mui/material";

import DashboardPage from "../../../(dashboard)/dashboard/page";
import DashboardRegistryPage from "../../../(dashboard)/dashboard/registry/page";
import DashboardActivePage from "../../../(dashboard)/dashboard/active/page";
import DashboardSuspensionsPage from "../../../(dashboard)/dashboard/suspensions/page";
import DashboardBillingRecoveryPage from "../../../(dashboard)/dashboard/billing-recovery/page";
import DashboardSupportPage from "../../../(dashboard)/dashboard/support/page";
import DashboardSupportOverviewPage from "../../../(dashboard)/dashboard/support-overview/page";
import DashboardPlatformHealthPage from "../../../(dashboard)/dashboard/platform-health/page";
import DashboardProvisioningPage from "../../../(dashboard)/dashboard/provisioning/page";
import DashboardIncidentsPage from "../../../(dashboard)/dashboard/incidents/page";
import DashboardOnboardingPage from "../../../(dashboard)/dashboard/onboarding/page";
import DashboardAccountPage from "../../../(dashboard)/dashboard/account/page";
import DashboardSettingsPage from "../../../(dashboard)/dashboard/settings/page";
import BillingPage from "../../../(billing)/billing/page";
import { AdminConsolePage } from "../../../(admin)/admin/page";
import AdminBillingOpsPage from "../../../(admin)/admin/billing-ops/page";
import AdminPlatformHealthPage from "../../../(admin)/admin/platform-health/page";
import AdminSupportOverviewPage from "../../../(admin)/admin/support-overview/page";

import { TenantDetailScaffold, TenantOverviewScaffold, TenantSectionPlaceholder, type TenantDetailSection } from "../_components/TenantDetailScaffold";

function normalizeSlug(slug: string | string[] | undefined): string[] {
  if (!slug) return [];
  return Array.isArray(slug) ? slug : [slug];
}

function tenantSectionTitle(section: TenantDetailSection): string {
  return {
    overview: "Tenant overview",
    members: "Tenant members",
    domains: "Tenant domains",
    billing: "Tenant billing",
    jobs: "Tenant jobs",
    audit: "Tenant audit",
    backups: "Tenant backups",
    support: "Tenant support",
  }[section];
}

function tenantSectionSubtitle(section: TenantDetailSection): string {
  return {
    overview: "Current status, next actions, and tenant-level orientation.",
    members: "Identity and access management for this tenant.",
    domains: "DNS and domain readiness for the tenant.",
    billing: "Payment state and billing context for this tenant.",
    jobs: "Jobs and execution history for this tenant.",
    audit: "Tenant-level change history and governance.",
    backups: "Recovery and backup visibility for this tenant.",
    support: "Support notes and follow-up for this tenant.",
  }[section];
}

function renderTenantDetail(tenantId: string, section: TenantDetailSection) {
  const contentBySection: Record<TenantDetailSection, ReactNode> = {
    overview: <TenantOverviewScaffold tenantId={tenantId} />,
    members: (
      <TenantSectionPlaceholder
        title="Members"
        body="This tab is scaffolded to own team membership and access review. The data view will be migrated in the next phase."
        actions={<Button component="a" href={`/app/tenants/${tenantId}/audit`} variant="outlined" color="inherit" sx={{ borderRadius: 99, textTransform: "none" }}>Open audit</Button>}
      />
    ),
    domains: (
      <TenantSectionPlaceholder
        title="Domains"
        body="This tab is scaffolded to own domain and DNS readiness. Domain verification details will land here next."
      />
    ),
    billing: (
      <TenantSectionPlaceholder
        title="Billing"
        body="This tab is scaffolded to own tenant-specific payment state and invoice access."
      />
    ),
    jobs: (
      <TenantSectionPlaceholder
        title="Jobs"
        body="This tab is scaffolded to own tenant-specific job history and execution monitoring."
      />
    ),
    audit: (
      <TenantSectionPlaceholder
        title="Audit"
        body="This tab is scaffolded to own tenant-level audit trails and change review."
      />
    ),
    backups: (
      <TenantSectionPlaceholder
        title="Backups"
        body="This tab is scaffolded to own backup and restore visibility for the tenant."
      />
    ),
    support: (
      <TenantSectionPlaceholder
        title="Support"
        body="This tab is scaffolded to own support notes and handoff information for the tenant."
      />
    ),
  };

  return (
    <TenantDetailScaffold tenantId={tenantId} section={section} title={tenantSectionTitle(section)} subtitle={tenantSectionSubtitle(section)}>
      {contentBySection[section]}
    </TenantDetailScaffold>
  );
}

function renderRoute(slug: string[]) {
  const [root, first, second] = slug;

  if (!root || root === "overview") {
    return <DashboardPage />;
  }

  if (root === "tenants") {
    if (!first) return <DashboardRegistryPage />;

    if (first === "active") return <DashboardActivePage />;
    if (first === "suspensions") return <DashboardSuspensionsPage />;

    if (second && ["overview", "members", "domains", "billing", "jobs", "audit", "backups", "support"].includes(second)) {
      return renderTenantDetail(first, second as TenantDetailSection);
    }

    if (!second) {
      return renderTenantDetail(first, "overview");
    }
  }

  if (root === "billing") {
    if (first === "recovery") return <DashboardBillingRecoveryPage />;
    return <BillingPage />;
  }

  if (root === "support") {
    if (first === "escalations") return <DashboardSupportOverviewPage />;
    return <DashboardSupportPage />;
  }

  if (root === "platform") {
    if (first === "health") return <DashboardPlatformHealthPage />;
    if (first === "provisioning") return <DashboardProvisioningPage />;
    if (first === "incidents") return <DashboardIncidentsPage />;
    if (first === "onboarding") return <DashboardOnboardingPage />;
  }

  if (root === "account") {
    if (first === "settings") return <DashboardSettingsPage />;
    return <DashboardAccountPage />;
  }

  if (root === "admin") {
    if (first === "billing-ops") return <AdminBillingOpsPage />;
    if (first === "platform-health") return <AdminPlatformHealthPage />;
    if (first === "support-tools") return <AdminSupportOverviewPage />;

    switch (first) {
      case "control-overview":
      case undefined:
        return <AdminConsolePage forcedView="overview" />;
      case "tenant-control":
        return <AdminConsolePage forcedView="tenants" />;
      case "jobs":
        return <AdminConsolePage forcedView="jobs" />;
      case "audit":
        return <AdminConsolePage forcedView="audit" />;
      case "recovery":
        return <AdminConsolePage forcedView="recovery" />;
      default:
        return <AdminConsolePage forcedView="support" />;
    }
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 4, p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Route scaffold not yet mapped
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The canonical `/app/*` shell is in place, but this route still needs a dedicated content split in the next phase.
        </Typography>
        <Alert severity="info" sx={{ borderRadius: 3 }}>
          AGENT-NOTE: Unmapped routes are kept explicit so we do not hide remaining migration gaps behind a generic fallback.
        </Alert>
        <Box>
          <Button component="a" href="/app/overview" variant="contained" sx={{ borderRadius: 99, textTransform: "none" }}>
            Back to overview
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}

export default function AppCatchAllRoute() {
  const params = useParams<{ slug?: string[] | string }>();
  const slug = normalizeSlug(params.slug);

  return renderRoute(slug);
}
