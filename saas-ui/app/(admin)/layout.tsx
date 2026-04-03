"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Box, Paper } from "@mui/material";

import { refreshAuthSession } from "../../domains/auth/application/authUseCases";
import { clearToken, getToken, saveToken } from "../../domains/auth/auth";
import {
  decideAdminRouteAccess,
  parseSessionToken,
} from "../../domains/auth/domain/adminRouteAccessPolicy";
import { AdminNav } from "../../domains/admin-ops/components/AdminNav";
import { AppFrame } from "../../domains/shell/components/AppFrame";
import { PageHeader } from "../../domains/shell/components/PageHeader";

type PageHeaderConfig = {
  overline: string;
  title: string;
  subtitle: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
};

const ADMIN_NON_QUEUE_HEADERS: Record<string, PageHeaderConfig> = {
  "/admin": {
    overline: "Operations",
    title: "Admin control center",
    subtitle: "Tenant reliability, governance workflows, and operator runbooks.",
    breadcrumbs: [{ label: "Admin" }],
  },
  "/admin/activity": {
    overline: "Operations",
    title: "Admin activity",
    subtitle: "Platform job timeline and cross-tenant operational events.",
    breadcrumbs: [{ label: "Admin", href: "/admin" }, { label: "Activity" }],
  },
  "/admin/audit": {
    overline: "Operations",
    title: "Admin audit",
    subtitle: "Security, compliance, and operator event timeline review.",
    breadcrumbs: [{ label: "Admin", href: "/admin" }, { label: "Audit" }],
  },
  "/admin/billing-ops": {
    overline: "Operations",
    title: "Billing operations",
    subtitle: "Dunning and billing follow-up workflow for account recovery.",
    breadcrumbs: [{ label: "Admin", href: "/admin" }, { label: "Billing ops" }],
  },
  "/admin/platform-health": {
    overline: "Operations",
    title: "Platform health",
    subtitle: "Infrastructure checks and queue readiness for operators.",
    breadcrumbs: [{ label: "Admin", href: "/admin" }, { label: "Platform health" }],
  },
  "/admin/support-overview": {
    overline: "Operations",
    title: "Support overview",
    subtitle: "Support readiness, SLA pressure, and escalation guidance.",
    breadcrumbs: [{ label: "Admin", href: "/admin" }, { label: "Support overview" }],
  },
  "/admin/control/overview": {
    overline: "Operations",
    title: "Control lane overview",
    subtitle: "At-a-glance control lane status and workflows.",
    breadcrumbs: [{ label: "Admin", href: "/admin" }, { label: "Control lane" }, { label: "Overview" }],
  },
  "/admin/control/jobs": {
    overline: "Operations",
    title: "Control lane jobs",
    subtitle: "Job execution monitoring and operational handoff.",
    breadcrumbs: [{ label: "Admin", href: "/admin" }, { label: "Control lane" }, { label: "Jobs" }],
  },
  "/admin/control/tenants": {
    overline: "Operations",
    title: "Control lane tenants",
    subtitle: "Tenant lifecycle operations from the control lane.",
    breadcrumbs: [{ label: "Admin", href: "/admin" }, { label: "Control lane" }, { label: "Tenants" }],
  },
  "/admin/control/audit": {
    overline: "Operations",
    title: "Control lane audit",
    subtitle: "Audit and policy timeline for operator actions.",
    breadcrumbs: [{ label: "Admin", href: "/admin" }, { label: "Control lane" }, { label: "Audit" }],
  },
  "/admin/control/support": {
    overline: "Operations",
    title: "Control lane support",
    subtitle: "Escalation and support coordination workflow.",
    breadcrumbs: [{ label: "Admin", href: "/admin" }, { label: "Control lane" }, { label: "Support" }],
  },
  "/admin/control/recovery": {
    overline: "Operations",
    title: "Control lane recovery",
    subtitle: "Recovery queue and dead-letter remediation flow.",
    breadcrumbs: [{ label: "Admin", href: "/admin" }, { label: "Control lane" }, { label: "Recovery" }],
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [checked, setChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  const nextPath = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    let active = true;

    const applyDecision = (redirectPath: string) => {
      if (!active) return;
      setAuthorized(false);
      setChecked(true);
      router.replace(redirectPath);
    };

    const ensureAdminSession = async () => {
      const token = getToken();
      const hadToken = Boolean(token);
      const payload = parseSessionToken(token);

      const immediateDecision = decideAdminRouteAccess({
        payload,
        hadToken,
        nextPath,
      });

      if (immediateDecision.allow) {
        if (active) {
          setAuthorized(true);
          setChecked(true);
        }
        return;
      }

      if (immediateDecision.status === 403) {
        applyDecision(immediateDecision.redirectPath);
        return;
      }

      const refreshed = await refreshAuthSession().catch(() => null);
      if (!active) return;

      if (refreshed?.access_token) {
        saveToken(refreshed.access_token);

        const refreshedDecision = decideAdminRouteAccess({
          payload: parseSessionToken(refreshed.access_token),
          hadToken: true,
          nextPath,
        });

        if (refreshedDecision.allow) {
          setAuthorized(true);
          setChecked(true);
          return;
        }

        if (refreshedDecision.status === 403) {
          clearToken();
        }

        applyDecision(refreshedDecision.redirectPath);
        return;
      }

      clearToken();
      applyDecision(immediateDecision.redirectPath);
    };

    void ensureAdminSession();

    return () => {
      active = false;
    };
  }, [nextPath, router]);

  if (!checked || !authorized) {
    return null;
  }

  const pageHeader = pathname ? ADMIN_NON_QUEUE_HEADERS[pathname] : undefined;

  return (
    <AppFrame sidebar={<AdminNav />}>
      <Box sx={{ display: "grid", gap: 3 }}>
        {pageHeader ? (
          <Paper variant="outlined" sx={{ borderColor: "divider", borderRadius: 4, p: 3 }}>
            <PageHeader
              overline={pageHeader.overline}
              title={pageHeader.title}
              subtitle={pageHeader.subtitle}
              breadcrumbs={pageHeader.breadcrumbs}
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
