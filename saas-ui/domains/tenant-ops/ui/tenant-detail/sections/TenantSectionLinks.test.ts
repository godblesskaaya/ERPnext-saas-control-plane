import assert from "node:assert/strict";
import test from "node:test";

import { buildTenantSectionNavItems } from "./TenantSectionLinks";

test("buildTenantSectionNavItems preserves expected route targets", () => {
  const tenantId = "tenant-123";
  const items = buildTenantSectionNavItems(`/tenants/${tenantId}`, tenantId);

  assert.deepEqual(
    items.map((item) => item.href),
    [
      `/tenants/${tenantId}`,
      `/tenants/${tenantId}/billing`,
      `/tenants/${tenantId}/jobs`,
      `/tenants/${tenantId}/backups`,
      `/tenants/${tenantId}/domains`,
      `/tenants/${tenantId}/members`,
      `/tenants/${tenantId}/audit`,
      `/tenants/${tenantId}/support`,
    ],
  );
});

test("buildTenantSectionNavItems marks overview active on canonical tenant root", () => {
  const tenantId = "tenant-123";
  const items = buildTenantSectionNavItems(`/tenants/${tenantId}`, tenantId);
  const activeLabels = items.filter((item) => item.active).map((item) => item.label);

  assert.deepEqual(activeLabels, ["Overview"]);
});

test("buildTenantSectionNavItems marks nested section paths active", () => {
  const tenantId = "tenant-123";
  const items = buildTenantSectionNavItems(`/tenants/${tenantId}/jobs/logs`, tenantId);
  const activeLabels = items.filter((item) => item.active).map((item) => item.label);

  assert.deepEqual(activeLabels, ["Jobs"]);
});
