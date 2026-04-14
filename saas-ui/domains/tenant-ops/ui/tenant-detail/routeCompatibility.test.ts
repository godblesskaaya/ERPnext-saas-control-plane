import assert from "node:assert/strict";
import test from "node:test";

import { isExactOrChildPath, isTenantOverviewPath } from "./routeCompatibility";

test("isTenantOverviewPath accepts canonical and legacy overview routes", () => {
  assert.equal(isTenantOverviewPath("/app/tenants/abc", "abc"), true);
  assert.equal(isTenantOverviewPath("/app/tenants/abc/", "abc"), true);
  assert.equal(isTenantOverviewPath("/app/tenants/abc/overview", "abc"), true);
  assert.equal(isTenantOverviewPath("/app/tenants/abc/overview/", "abc"), true);
  assert.equal(isTenantOverviewPath("/tenants/abc", "abc"), true);
  assert.equal(isTenantOverviewPath("/tenants/abc/", "abc"), true);
  assert.equal(isTenantOverviewPath("/tenants/abc/overview", "abc"), true);
  assert.equal(isTenantOverviewPath("/tenants/abc/overview/", "abc"), true);
});

test("isTenantOverviewPath rejects non-overview tenant routes", () => {
  assert.equal(isTenantOverviewPath("/app/tenants/abc/jobs", "abc"), false);
  assert.equal(isTenantOverviewPath("/tenants/abc/jobs", "abc"), false);
  assert.equal(isTenantOverviewPath("/tenants/xyz", "abc"), false);
});

test("isExactOrChildPath matches exact and nested paths", () => {
  assert.equal(isExactOrChildPath("/app/tenants/abc/jobs", "/app/tenants/abc/jobs"), true);
  assert.equal(isExactOrChildPath("/app/tenants/abc/jobs/current", "/app/tenants/abc/jobs"), true);
  assert.equal(isExactOrChildPath("/app/tenants/abc/job", "/app/tenants/abc/jobs"), false);
  assert.equal(isExactOrChildPath("/app/tenants/abc/jobs-archive", "/app/tenants/abc/jobs"), false);
  assert.equal(isExactOrChildPath("/app/tenants/abc/jobs///", "/app/tenants/abc/jobs"), true);
  assert.equal(isExactOrChildPath("/tenants/abc/jobs", "/tenants/abc/jobs"), true);
  assert.equal(isExactOrChildPath("/tenants/abc/jobs/current", "/tenants/abc/jobs"), true);
  assert.equal(isExactOrChildPath("/tenants/abc/job", "/tenants/abc/jobs"), false);
  assert.equal(isExactOrChildPath("/tenants/abc/jobs-archive", "/tenants/abc/jobs"), false);
  assert.equal(isExactOrChildPath("/tenants/abc/jobs///", "/tenants/abc/jobs"), true);
});
