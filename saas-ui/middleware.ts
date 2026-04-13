import { NextRequest, NextResponse } from "next/server";
import { normalizeCompatibilityRoute, resolveCompatibilityRoute } from "./domains/shared/lib/routeCompatibility";

const TOKEN_COOKIE = "erp_saas_token";
const ROLE_COOKIE = "erp_saas_role";
const USER_COOKIE = "erp_saas_user";
const DEFAULT_WORKSPACE_REDIRECT = "/app/overview";
const ROUTE_COMPATIBILITY_MODE = process.env.ROUTE_COMPATIBILITY_MODE === "observe" ? "observe" : "redirect";
const ROUTE_COMPATIBILITY_SUNSET_AT = "2026-06-30T00:00:00Z";
const LEGACY_ADMIN_ROOT_ROUTE_REDIRECTS: Record<string, string> = {
  overview: "/app/admin/control-overview",
  tenants: "/app/admin/tenant-control",
  jobs: "/app/admin/jobs",
  audit: "/app/admin/audit",
  support: "/app/admin/support-tools",
  recovery: "/app/admin/recovery",
};

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
  return ["/app", "/dashboard", "/billing", "/admin", "/onboarding", "/tenants"].some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

function isAdminRoute(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/app/admin" || pathname.startsWith("/app/admin/");
}

function isAdminOperatorRole(role: string | undefined): boolean {
  return role === "admin" || role === "support";
}

function resolveLegacyAdminRootRedirect(request: NextRequest): URL | null {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/admin") {
    return null;
  }

  const viewParam = searchParams.get("view");
  const targetPath =
    (viewParam && LEGACY_ADMIN_ROOT_ROUTE_REDIRECTS[viewParam]) || LEGACY_ADMIN_ROOT_ROUTE_REDIRECTS.overview;

  const destination = new URL(targetPath, request.url);
  for (const [key, value] of searchParams.entries()) {
    if (key === "view") continue;
    destination.searchParams.append(key, value);
  }

  return destination;
}

function isPublicAuthRoute(pathname: string): boolean {
  return ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"].includes(pathname);
}

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_WORKSPACE_REDIRECT;
  }
  return normalizeCompatibilityRoute(value);
}

function buildLoginUrl(request: NextRequest, sessionExpired: boolean): URL {
  const loginUrl = new URL("/login", request.url);
  const nextPath = normalizeCompatibilityRoute(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  loginUrl.searchParams.set("next", nextPath);
  if (sessionExpired) {
    loginUrl.searchParams.set("sessionExpired", "1");
  }
  return loginUrl;
}

function forbiddenHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>403 Forbidden</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, -apple-system, sans-serif; background: #020617; color: #e2e8f0; display: grid; min-height: 100vh; place-items: center; }
      .card { width: min(90vw, 560px); border: 1px solid #334155; background: rgba(15, 23, 42, 0.8); border-radius: 16px; padding: 28px; }
      h1 { margin: 0 0 10px; font-size: 1.5rem; }
      p { margin: 0 0 16px; color: #cbd5e1; line-height: 1.5; }
      a { color: #7dd3fc; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>403 — Admin or support access required</h1>
      <p>Your account does not have permission to view this operator route.</p>
      <p><a href="/app/overview">Return to overview</a></p>
    </div>
  </body>
</html>`;
}

function annotateCompatibilityResponse(
  response: NextResponse,
  routeId: string,
  canonicalPath: string,
): void {
  response.headers.set("x-compat-route", routeId);
  response.headers.set("x-compat-canonical", canonicalPath);
  response.headers.set("x-compat-mode", ROUTE_COMPATIBILITY_MODE);
  response.headers.set("x-compat-sunset-at", ROUTE_COMPATIBILITY_SUNSET_AT);
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
    return new NextResponse(forbiddenHtml(), {
      status: 403,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const legacyAdminRootRedirect = resolveLegacyAdminRootRedirect(request);
  if (legacyAdminRootRedirect) {
    const redirectResponse = NextResponse.redirect(legacyAdminRootRedirect, 308);
    annotateCompatibilityResponse(
      redirectResponse,
      "admin-view",
      `${legacyAdminRootRedirect.pathname}${legacyAdminRootRedirect.search}`,
    );
    return redirectResponse;
  }

  const compatibility = resolveCompatibilityRoute(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (compatibility) {
    if (ROUTE_COMPATIBILITY_MODE === "observe") {
      const observeResponse = NextResponse.next();
      annotateCompatibilityResponse(observeResponse, compatibility.id, compatibility.canonicalPath);
      return observeResponse;
    }

    const redirectResponse = NextResponse.redirect(new URL(compatibility.canonicalPath, request.url), 308);
    annotateCompatibilityResponse(redirectResponse, compatibility.id, compatibility.canonicalPath);
    return redirectResponse;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/app/:path*",
    "/admin",
    "/billing",
    "/dashboard/:path*",
    "/billing/:path*",
    "/admin/:path*",
    "/onboarding/:path*",
    "/tenants/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
};
