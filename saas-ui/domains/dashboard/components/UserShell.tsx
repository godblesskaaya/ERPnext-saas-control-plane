"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Box, Container } from "@mui/material";

import { refreshAuthSession } from "../../auth/application/authUseCases";
import { clearToken, getToken, saveToken } from "../../auth/auth";
import { DashboardNav } from "./DashboardNav";

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
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
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
    <Box sx={{ minHeight: "100vh", bgcolor: "#f8f5ef", py: { xs: 2, md: 3 } }}>
      <Container maxWidth="xl">
        <Box
          sx={{
            display: "grid",
            gap: 3,
            gridTemplateColumns: { xs: "1fr", lg: "300px minmax(0,1fr)" },
            alignItems: "start",
          }}
        >
          <DashboardNav />
          <Box sx={{ display: "grid", gap: 3 }}>{children}</Box>
        </Box>
      </Container>
    </Box>
  );
}
