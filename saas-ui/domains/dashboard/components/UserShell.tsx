"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Box, Paper } from "@mui/material";

import { refreshAuthSession } from "../../auth/application/authUseCases";
import { clearToken, getToken, saveToken } from "../../auth/auth";
import { PageHeader } from "../../shell/components/PageHeader";
import { AppFrame } from "../../shell/components/AppFrame";
import { DashboardNav } from "./DashboardNav";
import { WorkspaceLocalNav } from "./WorkspaceLocalNav";

type PageHeaderConfig = {
  overline: string;
  title: string;
  subtitle: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
};

const DASHBOARD_NON_QUEUE_HEADERS: Record<string, PageHeaderConfig> = {
  "/dashboard": {
    overline: "Dashboard",
    title: "Workspace command center",
    subtitle: "Workspace dashboards and customer-safe operational checkpoints.",
    breadcrumbs: [{ label: "Dashboard" }],
  },
  "/dashboard/account": {
    overline: "Dashboard",
    title: "Account workspace",
    subtitle: "Profile, billing identity, and account readiness details.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Account" }],
  },
  "/dashboard/activity": {
    overline: "Dashboard",
    title: "Workspace activity",
    subtitle: "Recent tenant-facing lifecycle and billing activity.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Activity" }],
  },
  "/dashboard/audit": {
    overline: "Dashboard",
    title: "Workspace audit",
    subtitle: "Compliance and timeline checks for customer-safe operations.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Audit" }],
  },
  "/dashboard/billing": {
    overline: "Dashboard",
    title: "Billing workspace",
    subtitle: "Customer billing review and payment follow-up controls.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Billing" }],
  },
  "/dashboard/billing-recovery": {
    overline: "Dashboard",
    title: "Billing recovery",
    subtitle: "Recovery steps for failed or pending payment states.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Billing recovery" }],
  },
  "/dashboard/platform-health": {
    overline: "Dashboard",
    title: "Platform health",
    subtitle: "Customer-safe health checks for key platform services.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Platform health" }],
  },
  "/dashboard/settings": {
    overline: "Dashboard",
    title: "Workspace settings",
    subtitle: "Notification, contact, and communication preferences.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }],
  },
  "/dashboard/support-overview": {
    overline: "Dashboard",
    title: "Support overview",
    subtitle: "Support guidance, readiness, and channel selection.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Support overview" }],
  },
};

function hasValidToken(token: string | null): boolean {
  if (!token) {
    return false;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) return false;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded)) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 > Date.now() : false;
  } catch {
    return false;
  }
}

export function UserShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;
    const ensureSession = async () => {
      const token = getToken();
      if (hasValidToken(token)) {
        if (active) {
          setAuthorized(true);
          setChecked(true);
        }
        return;
      }

      const refreshed = await refreshAuthSession();
      if (!active) return;
      if (refreshed?.access_token) {
        saveToken(refreshed.access_token);
        setAuthorized(true);
        setChecked(true);
        return;
      }

      clearToken();
      setAuthorized(false);
      setChecked(true);
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard/overview")}`);
    };

    void ensureSession();
    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (!checked || !authorized) {
    return null;
  }

  return (
    <AppFrame sidebar={<DashboardNav />}>
      <Box sx={{ display: "grid", gap: 3 }}>
        <WorkspaceLocalNav />
        {pathname && DASHBOARD_NON_QUEUE_HEADERS[pathname] ? (
          <Paper variant="outlined" sx={{ borderColor: "divider", borderRadius: 4, p: 3 }}>
            <PageHeader
              overline={DASHBOARD_NON_QUEUE_HEADERS[pathname].overline}
              title={DASHBOARD_NON_QUEUE_HEADERS[pathname].title}
              subtitle={DASHBOARD_NON_QUEUE_HEADERS[pathname].subtitle}
              breadcrumbs={DASHBOARD_NON_QUEUE_HEADERS[pathname].breadcrumbs}
            />
          </Paper>
        ) : null}
        <Box component="section" sx={{ display: "grid", gap: 3 }}>
          {children}
        </Box>
      </Box>
    </AppFrame>
  );
}
