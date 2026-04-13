import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLoginRedirectPath,
  decideAdminRouteAccess,
  hasLiveSession,
  isAdminSession,
  parseSessionToken,
} from "./adminRouteAccessPolicy";

function buildToken(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encodedPayload}.signature`;
}

test("parseSessionToken decodes JWT payloads and handles invalid input", () => {
  const token = buildToken({ role: "admin", exp: 2_000_000_000 });
  assert.deepEqual(parseSessionToken(token), { role: "admin", exp: 2_000_000_000 });
  assert.equal(parseSessionToken("invalid"), null);
  assert.equal(parseSessionToken(null), null);
});

test("hasLiveSession and isAdminSession reflect operator auth state", () => {
  assert.equal(hasLiveSession({ exp: 2_000_000_000 }, 1_700_000_000_000), true);
  assert.equal(hasLiveSession({ exp: 1 }, 1_700_000_000_000), false);
  assert.equal(isAdminSession({ role: "admin" }), true);
  assert.equal(isAdminSession({ role: "support" }), true);
  assert.equal(isAdminSession({ role: "user" }), false);
});

test("decideAdminRouteAccess allows live admin sessions on admin routes", () => {
  const decision = decideAdminRouteAccess({
    payload: { role: "admin", exp: 2_000_000_000 },
    hadToken: true,
    nextPath: "/admin/control/overview",
    nowMs: 1_700_000_000_000,
  });

  assert.deepEqual(decision, { allow: true });
});

test("decideAdminRouteAccess allows live support sessions on admin routes", () => {
  const decision = decideAdminRouteAccess({
    payload: { role: "support", exp: 2_000_000_000 },
    hadToken: true,
    nextPath: "/admin/control/support",
    nowMs: 1_700_000_000_000,
  });

  assert.deepEqual(decision, { allow: true });
});

test("decideAdminRouteAccess denies non-admin sessions with 403-compatible redirect", () => {
  const decision = decideAdminRouteAccess({
    payload: { role: "user", exp: 2_000_000_000 },
    hadToken: true,
    nextPath: "/admin/billing",
    nowMs: 1_700_000_000_000,
  });

  assert.deepEqual(decision, {
    allow: false,
    status: 403,
    reason: "admin-required",
    redirectPath: "/app/overview?reason=admin-required",
  });
});

test("decideAdminRouteAccess treats expired tokens as 401 session-expired", () => {
  const decision = decideAdminRouteAccess({
    payload: { role: "admin", exp: 1 },
    hadToken: true,
    nextPath: "/admin/control/jobs?tab=failed",
    nowMs: 1_700_000_000_000,
  });

  assert.deepEqual(decision, {
    allow: false,
    status: 401,
    reason: "session-expired",
    redirectPath: "/login?next=%2Fadmin%2Fcontrol%2Fjobs%3Ftab%3Dfailed&sessionExpired=1",
  });
});

test("decideAdminRouteAccess treats missing token as 401 unauthenticated", () => {
  const decision = decideAdminRouteAccess({
    payload: null,
    hadToken: false,
    nextPath: "/admin/support",
    nowMs: 1_700_000_000_000,
  });

  assert.deepEqual(decision, {
    allow: false,
    status: 401,
    reason: "unauthenticated",
    redirectPath: "/login?next=%2Fadmin%2Fsupport",
  });
});

test("buildLoginRedirectPath appends sessionExpired only when needed", () => {
  assert.equal(buildLoginRedirectPath("/admin/audit", false), "/login?next=%2Fadmin%2Faudit");
  assert.equal(
    buildLoginRedirectPath("/admin/audit", true),
    "/login?next=%2Fadmin%2Faudit&sessionExpired=1",
  );
});
