import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const tenantRootPagePath = resolve(process.cwd(), "app/(app-shell)/app/tenants/[tenantId]/page.tsx");

function readTenantRootSource(): string {
  return readFileSync(tenantRootPagePath, "utf8");
}

test("tenant root page converges to overview-only flow", () => {
  const source = readTenantRootSource();

  const hasOverviewForwarding =
    /from\s+["'][^"']*overview\/page["']/.test(source) ||
    (/\bredirect\s*\(/.test(source) && /overview/.test(source));

  assert.equal(
    hasOverviewForwarding,
    true,
    "Tenant root page should forward to the overview route (re-export/import or redirect).",
  );

  const legacyOperationalSignals = [
    "loadTenantBackupManifest",
    "loadTenantMembersUseCase",
    "loadTenantDomainsUseCase",
    "loadTenantSupportNotesUseCase",
    "loadTenantRecentJobs",
    "restoreTenantFromBackup",
    "verifyTenantDomain",
    "inviteTenantMember",
    "updateTenantMemberRole",
    "removeTenantMember",
    "createTenantSupportNote",
    "updateTenantSupportNote",
    "TenantActivitySection",
    "TenantSubscriptionSection",
    "JobLogPanel",
    "TenantDetailSectionAnchor",
    "routeSectionToAnchor",
  ];

  for (const signal of legacyOperationalSignals) {
    assert.equal(
      source.includes(signal),
      false,
      `Tenant root page still contains legacy operational concern: ${signal}`,
    );
  }
});
