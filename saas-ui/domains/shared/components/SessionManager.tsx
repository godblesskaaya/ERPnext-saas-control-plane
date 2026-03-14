"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { api, onSessionExpired } from "../lib/api";
import { clearToken, getToken, saveToken } from "../../auth/auth";

type TokenPayload = {
  exp?: number;
};

function parseTokenPayload(token: string | null): TokenPayload | null {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}

export function SessionManager() {
  const router = useRouter();
  const refreshingRef = useRef(false);

  useEffect(() => {
    const maybeRefresh = async () => {
      const token = getToken();
      const payload = parseTokenPayload(token);
      if (!payload?.exp) return;

      const expiresAt = payload.exp * 1000;
      const remainingMs = expiresAt - Date.now();
      if (remainingMs > 10 * 60 * 1000) return;

      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const result = await api.refreshToken();
        if (result?.access_token) {
          saveToken(result.access_token);
        }
      } catch {
        clearToken();
      } finally {
        refreshingRef.current = false;
      }
    };

    void maybeRefresh();
    const interval = window.setInterval(() => {
      void maybeRefresh();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return onSessionExpired(() => {
      router.push(`/login?reason=session-expired&next=${encodeURIComponent(window.location.pathname)}`);
    });
  }, [router]);

  return null;
}
