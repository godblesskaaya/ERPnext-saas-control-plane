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

test("redirects unauthenticated app shell access to login with app next param", () => {
  const response = middleware(request("/app/overview"));

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost/login?next=%2Fapp%2Foverview");
});

test("redirects unauthenticated canonical app billing access to login with canonical next param", () => {
  const response = middleware(request("/app/billing/invoices?tab=overdue"));

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost/login?next=%2Fapp%2Fbilling%2Finvoices%3Ftab%3Doverdue",
  );
});

test("redirects unauthenticated admin access to login with canonical next param", () => {
  const response = middleware(request("/app/admin/control-overview"));

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost/login?next=%2Fapp%2Fadmin%2Fcontrol-overview");
});

test("returns 403 html for authenticated non-operator access to /app/admin/* routes", async () => {
  const token = createJwt({ role: "member", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/app/admin/control-overview", `erp_saas_token=${token}; erp_saas_role=member`));

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  const body = await response.text();
  assert.match(body, /403 — Admin or support access required/);
});

test("allows support-role sessions on /app/admin/* routes", () => {
  const token = createJwt({ role: "support", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/app/admin/control-overview", `erp_saas_token=${token}; erp_saas_role=support`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});

test("keeps non-admin workspace route flow accessible", () => {
  const token = createJwt({ role: "member", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/app/overview", `erp_saas_token=${token}; erp_saas_role=member`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});

test("expired sessions redirect to login with sessionExpired flag", () => {
  const expiredToken = createJwt({ role: "admin", exp: Math.floor(Date.now() / 1000) - 60 });
  const response = middleware(request("/app/admin/control-overview", `erp_saas_token=${expiredToken}; erp_saas_role=admin`));

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost/login?next=%2Fapp%2Fadmin%2Fcontrol-overview&sessionExpired=1",
  );
  assert.equal(response.cookies.get("erp_saas_token")?.value, "");
});

test("middleware does not rewrite admin query routes for authenticated admins", () => {
  const token = createJwt({ role: "admin", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/admin?view=jobs&page=2", `erp_saas_token=${token}; erp_saas_role=admin`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});

test("middleware does not rewrite authenticated dashboard routes", () => {
  const token = createJwt({ role: "member", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/dashboard?verifyEmail=1", `erp_saas_token=${token}; erp_saas_role=member`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});

test("middleware does not rewrite authenticated billing routes", () => {
  const token = createJwt({ role: "member", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/billing?plan=starter", `erp_saas_token=${token}; erp_saas_role=member`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});

test("middleware does not rewrite authenticated dashboard billing routes", () => {
  const token = createJwt({ role: "member", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/dashboard/billing-details?tab=invoices", `erp_saas_token=${token}; erp_saas_role=member`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});

test("middleware does not rewrite authenticated tenant routes", () => {
  const token = createJwt({ role: "member", exp: Math.floor(Date.now() / 1000) + 3600 });
  const response = middleware(request("/tenants/acme", `erp_saas_token=${token}; erp_saas_role=member`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});
