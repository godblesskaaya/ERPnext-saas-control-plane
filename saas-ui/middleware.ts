import { NextRequest, NextResponse } from "next/server";

const TOKEN_COOKIE = "erp_saas_token";
const ROLE_COOKIE = "erp_saas_role";
const USER_COOKIE = "erp_saas_user";
const DEFAULT_WORKSPACE_REDIRECT = "/app/overview";

type JwtPayload = {
  exp?: number;
  role?: string;
};

function decodePayload(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

function isProtected(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isAdminRoute(pathname: string): boolean {
  return pathname === "/app/admin" || pathname.startsWith("/app/admin/");
}

function isAdminOperatorRole(role: string | undefined): boolean {
  return role === "admin" || role === "support";
}

function isPublicAuthRoute(pathname: string): boolean {
  return ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"].includes(pathname);
}

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_WORKSPACE_REDIRECT;
  }
  return value;
}

function buildLoginUrl(request: NextRequest, sessionExpired: boolean): URL {
  const loginUrl = new URL("/login", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", nextPath);
  if (sessionExpired) {
    loginUrl.searchParams.set("sessionExpired", "1");
  }
  return loginUrl;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;

  if (pathname === "/verify-email") {
    return NextResponse.next();
  }

  if (isPublicAuthRoute(pathname)) {
    if (request.nextUrl.searchParams.get("logout") === "1") {
      return NextResponse.next();
    }

    if (!token) {
      return NextResponse.next();
    }

    const payload = decodePayload(token);
    const expired = Boolean(payload?.exp && payload.exp * 1000 <= Date.now());

    if (expired) {
      const response = NextResponse.next();
      response.cookies.delete(TOKEN_COOKIE);
      response.cookies.delete(ROLE_COOKIE);
      response.cookies.delete(USER_COOKIE);
      return response;
    }

    const nextPath = safeRedirectPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(buildLoginUrl(request, false));
  }

  const payload = decodePayload(token);
  const expired = Boolean(payload?.exp && payload.exp * 1000 <= Date.now());

  if (expired) {
    const response = NextResponse.redirect(buildLoginUrl(request, true));
    response.cookies.delete(TOKEN_COOKIE);
    response.cookies.delete(ROLE_COOKIE);
    response.cookies.delete(USER_COOKIE);
    return response;
  }

  const role = request.cookies.get(ROLE_COOKIE)?.value ?? payload?.role;
  if (isAdminRoute(pathname) && !isAdminOperatorRole(role)) {
    return new NextResponse(
      "<!doctype html><html><body><h1>403 — Admin or support access required</h1></body></html>",
      { status: 403, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/app/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
};
