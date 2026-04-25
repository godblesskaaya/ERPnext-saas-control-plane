"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Alert, Box } from "@mui/material";

import { AppFooter } from "../../../../domains/shell/components/AppFooter";
import { AppFrame } from "../../../../domains/shell/components/AppFrame";
import { StatusStrip } from "../../../../domains/shell/components/StatusStrip";
import { WorkspaceSidebar } from "../../../../domains/shell/components/WorkspaceSidebar";
import { clearToken, getToken, saveToken } from "../../../../domains/auth/auth";
import { refreshAuthSession } from "../../../../domains/auth/application/authUseCases";
import { decideAdminRouteAccess, isAdminSession, parseSessionToken } from "../../../../domains/auth/domain/adminRouteAccessPolicy";
import { buildAppNavSections } from "./appNavigation";

function hasValidToken(token: string | null): boolean {
  if (!token) return false;
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

function buildLoginUrl(pathname: string): string {
  const next = pathname.startsWith("/app") ? pathname : "/app/overview";
  return `/login?next=${encodeURIComponent(next)}`;
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/app/overview";
  const [checked, setChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [canSeeAdmin, setCanSeeAdmin] = useState(false);
  const sections = useMemo(() => buildAppNavSections(canSeeAdmin), [canSeeAdmin]);

  useEffect(() => {
    let active = true;

    const finish = (nextAuthorized: boolean, nextCanSeeAdmin: boolean) => {
      if (!active) return;
      setAuthorized(nextAuthorized);
      setCanSeeAdmin(nextCanSeeAdmin);
      setChecked(true);
    };

    const ensureSession = async () => {
      const token = getToken();
      const payload = parseSessionToken(token);
      const live = hasValidToken(token);

      if (live) {
        finish(true, isAdminSession(payload));
        return;
      }

      const refreshed = await refreshAuthSession().catch(() => null);
      if (!active) return;

      if (refreshed?.access_token) {
        saveToken(refreshed.access_token);
        const refreshedPayload = parseSessionToken(refreshed.access_token);
        finish(true, isAdminSession(refreshedPayload));
        return;
      }

      clearToken();
      router.replace(buildLoginUrl(pathname));
      finish(false, false);
    };

    void ensureSession();
    return () => {
      active = false;
    };
  }, [pathname, router]);

  useEffect(() => {
    if (!checked || !authorized) return;

    if (pathname === "/app") {
      router.replace("/app/overview");
      return;
    }

    if (pathname.startsWith("/app/admin")) {
      const payload = parseSessionToken(getToken());
      const access = decideAdminRouteAccess({
        payload,
        hadToken: Boolean(getToken()),
        nextPath: pathname,
      });
      if (!access.allow) {
        router.replace("/app/overview?reason=admin-required");
      }
    }
  }, [authorized, checked, pathname, router]);

  if (!checked || !authorized) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", px: 2 }}>
        <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
          Loading authenticated app shell…
        </Alert>
      </Box>
    );
  }

  return (
    <AppFrame
      sidebar={
        <WorkspaceSidebar
          overline="Biashara Cloud"
          title="Navigation"
          sections={sections}
          pathname={pathname}
          tone="light"
        />
      }
      mobileSidebar={
        <WorkspaceSidebar
          overline="Biashara Cloud"
          title="Navigation"
          sections={sections}
          pathname={pathname}
          tone="light"
          compact
        />
      }
      footer={canSeeAdmin ? <StatusStrip /> : <AppFooter />}
    >
      {children}
    </AppFrame>
  );
}

