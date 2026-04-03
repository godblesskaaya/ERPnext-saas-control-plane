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
  assert.equal(inferDashboardNavModeFromRoute("/admin/billing"), "operations");
  assert.equal(inferDashboardNavModeFromRoute("/admin/provisioning"), "operations");
});

test("infers workspace mode from workspace routes", () => {
  assert.equal(inferDashboardNavModeFromRoute("/dashboard/account"), "workspace");
  assert.equal(inferDashboardNavModeFromRoute("/dashboard/settings/preferences"), "workspace");
  assert.equal(inferDashboardNavModeFromRoute("/dashboard/overview"), "workspace");
  assert.equal(inferDashboardNavModeFromRoute("/tenants/123"), "workspace");
  assert.equal(inferDashboardNavModeFromRoute("/billing"), "workspace");
  assert.equal(inferDashboardNavModeFromRoute("/dashboard/billing-recovery"), "workspace");
  assert.equal(inferDashboardNavModeFromRoute("/dashboard/billing-ops"), "workspace");
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
  assert.ok(workspaceSections.some((section) => section.title === "Overview workspace"));
  assert.ok(workspaceSections.some((section) => section.title === "Account workspace"));
});

test("workspace navigation excludes admin-only concepts and ops-centric routes", () => {
  const workspaceSections = getDashboardNavSectionsByMode("workspace");
  const disallowedCopy = /\b(admin|operator|ops|operational)\b/i;

  for (const section of workspaceSections) {
    assert.equal(section.items.every((item) => !item.href.startsWith("/admin")), true);
    assert.equal(section.items.every((item) => !item.href.includes("-ops")), true);
    assert.equal(disallowedCopy.test(section.title), false);
    assert.equal(disallowedCopy.test(section.description), false);
    for (const item of section.items) {
      assert.equal(disallowedCopy.test(item.label), false);
      assert.equal(disallowedCopy.test(item.hint), false);
    }
  }
});

test("workspace navigation routes never point to admin pages", () => {
  const workspaceSections = getDashboardNavSectionsByMode("workspace");

  for (const section of workspaceSections) {
    for (const item of section.items) {
      assert.equal(item.href.startsWith("/admin"), false);
    }
  }
});

test("workspace navigation copy avoids admin-only terminology", () => {
  const workspaceSections = getDashboardNavSectionsByMode("workspace");
  const disallowed = /\b(admin|operator|ops|control plane)\b/i;

  for (const section of workspaceSections) {
    assert.equal(disallowed.test(section.title), false);
    assert.equal(disallowed.test(section.description), false);

    for (const item of section.items) {
      assert.equal(disallowed.test(item.label), false);
      assert.equal(disallowed.test(item.hint), false);
    }
  }
});
