"use client";

const TOKEN_KEY = "erp_saas_token";
const ROLE_KEY = "erp_saas_role";
const USER_KEY = "erp_saas_user";

type TokenPayload = {
  exp?: number;
  role?: string;
  email?: string;
  sub?: string;
};

function parseToken(token: string): TokenPayload | null {
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

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax${secure}`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

export function saveToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);

    const payload = parseToken(token);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const maxAge = payload?.exp && payload.exp > nowSeconds ? payload.exp - nowSeconds : 60 * 60;

    setCookie(TOKEN_KEY, token, maxAge);

    if (payload?.role) {
      localStorage.setItem(ROLE_KEY, payload.role);
      setCookie(ROLE_KEY, payload.role, maxAge);
    } else {
      localStorage.removeItem(ROLE_KEY);
      clearCookie(ROLE_KEY);
    }

    const user = payload?.email ?? payload?.sub;
    if (user) {
      localStorage.setItem(USER_KEY, user);
      setCookie(USER_KEY, user, maxAge);
    } else {
      localStorage.removeItem(USER_KEY);
      clearCookie(USER_KEY);
    }
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY) ?? getCookie(TOKEN_KEY);
}

export function getSessionRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ROLE_KEY) ?? getCookie(ROLE_KEY);
}

export function clearToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(USER_KEY);
    clearCookie(TOKEN_KEY);
    clearCookie(ROLE_KEY);
    clearCookie(USER_KEY);
  }
}
