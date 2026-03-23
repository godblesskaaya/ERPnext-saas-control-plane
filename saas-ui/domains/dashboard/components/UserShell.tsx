"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

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
    <div className="min-h-screen bg-[#f8f5ef]">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <DashboardNav />
          <div className="space-y-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
