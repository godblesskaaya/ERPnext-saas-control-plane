import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCompatibilityRoute, resolveCompatibilityRoute } from "./routeCompatibility";

test("resolveCompatibilityRoute detects dashboard root alias", () => {
  const resolved = resolveCompatibilityRoute("/dashboard?verifyEmail=1");
  assert.deepEqual(resolved, {
    id: "dashboard-root",
    legacyPath: "/dashboard?verifyEmail=1",
    canonicalPath: "/dashboard/overview?verifyEmail=1",
  });
});

test("resolveCompatibilityRoute detects tenant root alias", () => {
  const resolved = resolveCompatibilityRoute("/tenants/tenant-123?tab=billing");
  assert.deepEqual(resolved, {
    id: "tenant-root",
    legacyPath: "/tenants/tenant-123?tab=billing",
    canonicalPath: "/tenants/tenant-123/overview?tab=billing",
  });
});

test("normalizeCompatibilityRoute keeps canonical paths unchanged", () => {
  assert.equal(normalizeCompatibilityRoute("/dashboard/overview"), "/dashboard/overview");
  assert.equal(normalizeCompatibilityRoute("/tenants/tenant-123/members"), "/tenants/tenant-123/members");
});

