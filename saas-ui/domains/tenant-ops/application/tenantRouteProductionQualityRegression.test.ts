import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

type TenantPageKey = "jobs" | "backups" | "members" | "domains" | "support" | "billing" | "audit";

const pagePaths: Record<TenantPageKey, string> = {
  jobs: "app/(app-shell)/app/tenants/[tenantId]/jobs/page.tsx",
  backups: "app/(app-shell)/app/tenants/[tenantId]/backups/page.tsx",
  members: "app/(app-shell)/app/tenants/[tenantId]/members/page.tsx",
  domains: "app/(app-shell)/app/tenants/[tenantId]/domains/page.tsx",
  support: "app/(app-shell)/app/tenants/[tenantId]/support/page.tsx",
  billing: "app/(app-shell)/app/tenants/[tenantId]/billing/page.tsx",
  audit: "app/(app-shell)/app/tenants/[tenantId]/audit/page.tsx",
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
  // Each tenant page must show three states: loading, unsupported (via FeatureUnavailable),
  // and error. The unsupported state copy now flows through the shared FeatureUnavailable
  // component instead of bespoke per-page strings.
  const directPageExpectations: Record<
    Extract<TenantPageKey, "jobs" | "backups" | "members" | "domains" | "support">,
    { loading: string; featureUnavailable: string; errorAlert: string }
  > = {
    jobs: {
      loading: "Loading jobs...",
      featureUnavailable: '<FeatureUnavailable feature="Job history"',
      errorAlert: '<Alert severity="error">{recentJobsError}</Alert>',
    },
    backups: {
      loading: "Loading backup history...",
      featureUnavailable: '<FeatureUnavailable feature="Backups"',
      errorAlert: '<Alert severity="error" sx={{ mt: 2 }}>{backupsError}</Alert>',
    },
    members: {
      loading: "Loading team members...",
      featureUnavailable: '<FeatureUnavailable feature="Team management"',
      errorAlert: '<Alert severity="error">{membersError}</Alert>',
    },
    domains: {
      loading: "Loading custom domains...",
      featureUnavailable: '<FeatureUnavailable feature="Custom domains"',
      errorAlert: '<Alert severity="error">{domainsError}</Alert>',
    },
    support: {
      loading: "Loading support notes...",
      featureUnavailable: '<FeatureUnavailable feature="Support notes"',
      errorAlert: '<Alert severity="error">{supportNotesError}</Alert>',
    },
  };

  for (const [pageKey, markers] of Object.entries(directPageExpectations) as Array<[
    keyof typeof directPageExpectations,
    { loading: string; featureUnavailable: string; errorAlert: string },
  ]>) {
    const source = readSource(pagePaths[pageKey]);

    assert.equal(source.includes(markers.loading), true, `${pageKey} page should keep loading marker: ${markers.loading}`);
    assert.equal(
      source.includes(markers.featureUnavailable),
      true,
      `${pageKey} page should keep feature-unavailable marker: ${markers.featureUnavailable}`,
    );
    assert.equal(source.includes(markers.errorAlert), true, `${pageKey} page should keep error alert marker: ${markers.errorAlert}`);
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
    '<FeatureUnavailable feature="Subscription details"',
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
    '<FeatureUnavailable feature="Activity log"',
    '<Alert severity="error">{auditError}</Alert>',
  ]) {
    assert.equal(activitySectionSource.includes(marker), true, `Activity section should keep state marker: ${marker}`);
  }
});
