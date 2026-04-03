import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

type TenantPageKey = "jobs" | "backups" | "members" | "domains" | "support" | "billing" | "audit";

const pagePaths: Record<TenantPageKey, string> = {
  jobs: "app/(dashboard)/tenants/[id]/jobs/page.tsx",
  backups: "app/(dashboard)/tenants/[id]/backups/page.tsx",
  members: "app/(dashboard)/tenants/[id]/members/page.tsx",
  domains: "app/(dashboard)/tenants/[id]/domains/page.tsx",
  support: "app/(dashboard)/tenants/[id]/support/page.tsx",
  billing: "app/(dashboard)/tenants/[id]/billing/page.tsx",
  audit: "app/(dashboard)/tenants/[id]/audit/page.tsx",
};

const tenantLayoutPath = "domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout.tsx";
const activitySectionPath = "domains/tenant-ops/ui/tenant-detail/sections/TenantActivitySection.tsx";
const subscriptionSectionPath = "domains/tenant-ops/ui/tenant-detail/sections/TenantSubscriptionSection.tsx";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

test("tenant route shell keeps shared layout and route-context error fallback wiring", () => {
  const tenantLayoutSource = readSource(tenantLayoutPath);

  assert.equal(
    tenantLayoutSource.includes("<TenantSectionLinks tenantId={tenantId} />"),
    true,
    "Tenant shell layout should render shared tenant section navigation.",
  );

  assert.equal(
    tenantLayoutSource.includes("{footerError ? <Alert severity=\"error\">{footerError}</Alert> : null}"),
    true,
    "Tenant shell layout should expose route-context errors via footer alert.",
  );

  for (const [pageKey, pagePath] of Object.entries(pagePaths) as Array<[TenantPageKey, string]>) {
    const source = readSource(pagePath);

    assert.equal(
      source.includes('return <Alert severity="error">Tenant id is missing from route.</Alert>;'),
      true,
      `${pageKey} page should keep explicit missing-tenant-id error fallback.`,
    );

    assert.equal(
      source.includes("tenantContext={tenant ? `${tenant.company_name} (${tenant.domain})` : \"Loading tenant context...\"}"),
      true,
      `${pageKey} page should keep loading tenant-context fallback copy.`,
    );

    assert.equal(source.includes("footerError={error}"), true, `${pageKey} page should pass route-context errors to the shell layout.`);
    assert.equal(source.includes("<TenantWorkspacePageLayout"), true, `${pageKey} page should render inside tenant workspace shell layout.`);
  }
});

test("support route preserves admin-only access gating", () => {
  const supportSource = readSource(pagePaths.support);

  assert.equal(
    supportSource.includes("const isAdmin = currentUser?.role === \"admin\";"),
    true,
    "Support page should compute admin role from current user.",
  );

  assert.equal(supportSource.includes("!isAdmin ? ("), true, "Support page should guard support notes rendering for non-admin users.");

  assert.equal(
    supportSource.includes("Support notes are visible to platform admins only."),
    true,
    "Support page should keep admin-only warning copy.",
  );
});

test("tenant operational pages keep loading/unsupported/error state markers", () => {
  const directPageExpectations: Record<Extract<TenantPageKey, "jobs" | "backups" | "members" | "domains" | "support">, string[]> = {
    jobs: [
      "Loading jobs...",
      "Job history endpoint is not available on this backend yet.",
      '<Alert severity="error">{recentJobsError}</Alert>',
    ],
    backups: [
      "Loading backup history...",
      "Backup history endpoint is not available on this backend yet.",
      '<Alert severity="error" sx={{ mt: 2 }}>{backupsError}</Alert>',
    ],
    members: [
      "Loading team members...",
      "Team management is not available on this backend yet.",
      '<Alert severity="error">{membersError}</Alert>',
    ],
    domains: [
      "Loading custom domains...",
      "Custom domain management is not available on this backend yet.",
      '<Alert severity="error">{domainsError}</Alert>',
    ],
    support: [
      "Loading support notes...",
      "Support notes are not available on this backend yet.",
      '<Alert severity="error">{supportNotesError}</Alert>',
    ],
  };

  for (const [pageKey, markers] of Object.entries(directPageExpectations) as Array<[
    keyof typeof directPageExpectations,
    string[],
  ]>) {
    const source = readSource(pagePaths[pageKey]);

    for (const marker of markers) {
      assert.equal(source.includes(marker), true, `${pageKey} page should keep state marker: ${marker}`);
    }
  }

  const billingSource = readSource(pagePaths.billing);
  assert.equal(
    billingSource.includes("<TenantSubscriptionSection"),
    true,
    "Billing page should render shared subscription section that contains loading/unsupported/error states.",
  );

  const subscriptionSectionSource = readSource(subscriptionSectionPath);
  for (const marker of [
    "Loading subscription details...",
    "Subscription endpoint is not available on this backend deployment yet.",
    "{subscriptionError ? <Alert severity=\"error\" sx={{ mt: 2 }}>{subscriptionError}</Alert> : null}",
  ]) {
    assert.equal(
      subscriptionSectionSource.includes(marker),
      true,
      `Subscription section should keep state marker: ${marker}`,
    );
  }

  const auditSource = readSource(pagePaths.audit);
  assert.equal(
    auditSource.includes("<TenantActivitySection"),
    true,
    "Audit page should render shared activity section that contains loading/unsupported/error states.",
  );

  const activitySectionSource = readSource(activitySectionPath);
  for (const marker of [
    "No activity recorded yet.",
    "Activity log endpoint is not available on this backend yet.",
    '<Alert severity="error">{auditError}</Alert>',
  ]) {
    assert.equal(activitySectionSource.includes(marker), true, `Activity section should keep state marker: ${marker}`);
  }
});
