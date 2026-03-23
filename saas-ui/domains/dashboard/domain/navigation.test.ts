import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardNavSections,
  defaultDashboardNavMode,
  getDashboardNavSectionsByMode,
  inferDashboardNavModeFromRoute,
  resolveDashboardNavMode,
} from "./navigation";

test("every navigation section declares a mode", () => {
  assert.ok(dashboardNavSections.length > 0);
  for (const section of dashboardNavSections) {
    assert.ok(section.mode === "operations" || section.mode === "workspace");
  }
});

test("infers operations mode from operational routes", () => {
  assert.equal(inferDashboardNavModeFromRoute("/dashboard/billing"), "operations");
  assert.equal(inferDashboardNavModeFromRoute("/dashboard/provisioning"), "operations");
});

test("infers workspace mode from workspace routes", () => {
  assert.equal(inferDashboardNavModeFromRoute("/dashboard/account"), "workspace");
  assert.equal(inferDashboardNavModeFromRoute("/dashboard/settings/preferences"), "workspace");
  assert.equal(inferDashboardNavModeFromRoute("/dashboard/overview"), "workspace");
  assert.equal(inferDashboardNavModeFromRoute("/tenants/123"), "workspace");
  assert.equal(inferDashboardNavModeFromRoute("/billing"), "workspace");
});

test("resolve mode falls back to default for unknown routes", () => {
  assert.equal(resolveDashboardNavMode("/dashboard/unknown"), defaultDashboardNavMode);
  assert.equal(resolveDashboardNavMode(undefined), defaultDashboardNavMode);
});

test("resolve mode strips query/hash when matching", () => {
  assert.equal(resolveDashboardNavMode("/dashboard/settings?tab=notifications#email"), "workspace");
});

test("sections can be filtered by mode", () => {
  const workspaceSections = getDashboardNavSectionsByMode("workspace");
  assert.ok(workspaceSections.length > 0);
  assert.ok(workspaceSections.some((section) => section.title === "Workspace routing"));
  assert.ok(workspaceSections.some((section) => section.title === "Account routing"));
});
