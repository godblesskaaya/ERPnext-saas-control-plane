import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { middleware } from "./middleware";

function createJwt(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encoded}.sig`;
}

function request(path: string, cookie?: string): NextRequest {
  const headers = cookie ? { cookie } : undefined;
  return new NextRequest(`http://localhost${path}`, { headers });
}

test("redirects unauthenticated admin access to login with next param", () => {
  const response = middleware(request("/admin/control/overview"));

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost/login?next=%2Fadmin%2Fcontrol%2Foverview");
});

test("returns 403 html for authenticated non-admin access to /admin/*", async () => {
  const token = createJwt({ role: "member", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/admin/control/tenants", `erp_saas_token=${token}; erp_saas_role=member`));

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  const body = await response.text();
  assert.match(body, /403 — Admin access required/);
});

test("keeps non-admin workspace route flow accessible", () => {
  const token = createJwt({ role: "member", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/dashboard/overview", `erp_saas_token=${token}; erp_saas_role=member`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});

test("expired sessions redirect to login with sessionExpired flag", () => {
  const expiredToken = createJwt({ role: "admin", exp: Math.floor(Date.now() / 1000) - 60 });
  const response = middleware(request("/admin/control/overview", `erp_saas_token=${expiredToken}; erp_saas_role=admin`));

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost/login?next=%2Fadmin%2Fcontrol%2Foverview&sessionExpired=1",
  );
  assert.equal(response.cookies.get("erp_saas_token")?.value, "");
});

test("admin root legacy routes redirect for authenticated admins", () => {
  const token = createJwt({ role: "admin", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/admin?view=jobs&page=2", `erp_saas_token=${token}; erp_saas_role=admin`));

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost/admin/control/jobs?page=2");
});

test("redirects authenticated dashboard root compatibility route to canonical overview", () => {
  const token = createJwt({ role: "member", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/dashboard?verifyEmail=1", `erp_saas_token=${token}; erp_saas_role=member`));

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "http://localhost/dashboard/overview?verifyEmail=1");
  assert.equal(response.headers.get("x-compat-route"), "dashboard-root");
  assert.equal(response.headers.get("x-compat-canonical"), "/dashboard/overview?verifyEmail=1");
});

test("redirects authenticated tenant root compatibility route to tenant overview", () => {
  const token = createJwt({ role: "member", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/tenants/acme", `erp_saas_token=${token}; erp_saas_role=member`));

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "http://localhost/tenants/acme/overview");
  assert.equal(response.headers.get("x-compat-route"), "tenant-root");
});
