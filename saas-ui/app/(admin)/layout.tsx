"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Box, Container } from "@mui/material";

import { refreshAuthSession } from "../../domains/auth/application/authUseCases";
import { clearToken, getToken, saveToken } from "../../domains/auth/auth";
import {
  decideAdminRouteAccess,
  parseSessionToken,
} from "../../domains/auth/domain/adminRouteAccessPolicy";
import { AdminNav } from "../../domains/admin-ops/components/AdminNav";

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

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#020617", color: "grey.100", py: { xs: 2, md: 3 } }}>
      <Container maxWidth="xl">
        <Box
          sx={{
            display: "grid",
            gap: 3,
            gridTemplateColumns: { xs: "1fr", lg: "280px minmax(0,1fr)" },
            alignItems: "start",
          }}
        >
          <AdminNav />
          <Box sx={{ display: "grid", gap: 3 }}>{children}</Box>
        </Box>
      </Container>
    </Box>
  );
}
