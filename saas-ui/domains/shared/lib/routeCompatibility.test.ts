import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCompatibilityRoute, resolveCompatibilityRoute } from "./routeCompatibility";

test("resolveCompatibilityRoute maps dashboard root alias to app overview", () => {
  const resolved = resolveCompatibilityRoute("/dashboard?verifyEmail=1");
  assert.deepEqual(resolved, {
    id: "dashboard-root",
    legacyPath: "/dashboard?verifyEmail=1",
    canonicalPath: "/app/overview?verifyEmail=1",
  });
});

test("resolveCompatibilityRoute maps dashboard billing detail alias to app billing invoices", () => {
  const resolved = resolveCompatibilityRoute("/dashboard/billing-details?tab=invoices");
  assert.deepEqual(resolved, {
    id: "dashboard-billing",
    legacyPath: "/dashboard/billing-details?tab=invoices",
    canonicalPath: "/app/billing/invoices?tab=invoices",
  });
});

test("resolveCompatibilityRoute maps billing root alias to app billing invoices", () => {
  const resolved = resolveCompatibilityRoute("/billing?plan=starter");
  assert.deepEqual(resolved, {
    id: "billing-root",
    legacyPath: "/billing?plan=starter",
    canonicalPath: "/app/billing/invoices?plan=starter",
  });
});

test("resolveCompatibilityRoute maps tenant root alias to app tenant overview", () => {
  const resolved = resolveCompatibilityRoute("/tenants/tenant-123?tab=billing");
  assert.deepEqual(resolved, {
    id: "tenant-root",
    legacyPath: "/tenants/tenant-123?tab=billing",
    canonicalPath: "/app/tenants/tenant-123/overview?tab=billing",
  });
});

test("resolveCompatibilityRoute maps tenant child routes to matching app tenant facets", () => {
  const resolved = resolveCompatibilityRoute("/tenants/tenant-123/members");
  assert.deepEqual(resolved, {
    id: "tenant-detail",
    legacyPath: "/tenants/tenant-123/members",
    canonicalPath: "/app/tenants/tenant-123/members",
  });
});

test("resolveCompatibilityRoute maps admin view query aliases to canonical app admin routes", () => {
  const resolved = resolveCompatibilityRoute("/admin?view=jobs&page=2");
  assert.deepEqual(resolved, {
    id: "admin-view",
    legacyPath: "/admin?view=jobs&page=2",
    canonicalPath: "/app/admin/jobs?page=2",
  });
});

test("resolveCompatibilityRoute maps legacy admin control routes to canonical app admin routes", () => {
  const resolved = resolveCompatibilityRoute("/admin/control/support?tab=queue");
  assert.deepEqual(resolved, {
    id: "admin-control-support",
    legacyPath: "/admin/control/support?tab=queue",
    canonicalPath: "/app/admin/support-tools?tab=queue",
  });
});

test("normalizeCompatibilityRoute keeps canonical /app paths unchanged", () => {
  assert.equal(normalizeCompatibilityRoute("/app/overview"), "/app/overview");
  assert.equal(normalizeCompatibilityRoute("/app/tenants/tenant-123/members"), "/app/tenants/tenant-123/members");
});
