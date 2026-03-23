"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { refreshAuthSession } from "../../domains/auth/application/authUseCases";
import { clearToken, getToken, saveToken } from "../../domains/auth/auth";
import { AdminNav } from "../../domains/admin-ops/components/AdminNav";

type SessionPayload = {
  exp?: number;
  role?: string;
};

function parseToken(token: string | null): SessionPayload | null {
  if (!token) return null;

  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded)) as SessionPayload;
  } catch {
    return null;
  }
}

function hasLiveSession(payload: SessionPayload | null): boolean {
  if (!payload?.exp) return false;
  return payload.exp * 1000 > Date.now();
}

function isAdmin(payload: SessionPayload | null): boolean {
  return payload?.role === "admin";
}

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

    const ensureAdminSession = async () => {
      const token = getToken();
      const payload = parseToken(token);

      if (hasLiveSession(payload)) {
        if (isAdmin(payload)) {
          if (active) {
            setAuthorized(true);
            setChecked(true);
          }
          return;
        }

        if (active) {
          setAuthorized(false);
          setChecked(true);
          router.replace("/dashboard/overview?reason=admin-required");
        }
        return;
      }

      const refreshed = await refreshAuthSession().catch(() => null);
      if (!active) return;

      if (refreshed?.access_token) {
        saveToken(refreshed.access_token);
        const refreshedPayload = parseToken(refreshed.access_token);

        if (isAdmin(refreshedPayload)) {
          setAuthorized(true);
          setChecked(true);
          return;
        }

        clearToken();
        setAuthorized(false);
        setChecked(true);
        router.replace("/dashboard/overview?reason=admin-required");
        return;
      }

      clearToken();
      setAuthorized(false);
      setChecked(true);
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <AdminNav />
          <div className="space-y-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
