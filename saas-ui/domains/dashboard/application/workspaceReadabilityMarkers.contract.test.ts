import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

const workspaceQueueRoutes = {
  overview: "app/(app-shell)/app/overview/page.tsx",
  registry: "app/(app-shell)/app/tenants/page.tsx",
  active: "app/(app-shell)/app/tenants/active/page.tsx",
  billingRecovery: "app/(app-shell)/app/billing/recovery/page.tsx",
  support: "app/(app-shell)/app/support/queue/page.tsx",
  provisioning: "app/(app-shell)/app/platform/provisioning/page.tsx",
  incidents: "app/(app-shell)/app/platform/incidents/page.tsx",
  onboarding: "app/(app-shell)/app/platform/onboarding/page.tsx",
} as const;

test("workspace queue routes expose readability markers (where am I, what is this, what next)", () => {
  for (const [routeName, routePath] of Object.entries(workspaceQueueRoutes)) {
    const source = readSource(routePath);

    assert.equal(source.includes("<WorkspaceQueuePage"), true, `${routeName} should use WorkspaceQueuePage.`);
    assert.equal(/\btitle="[^"]+"/.test(source), true, `${routeName} should declare a title marker.`);
    assert.equal(/\bdescription="[^"]+"/.test(source), true, `${routeName} should declare a purpose description marker.`);

    const hasWhatNextMarker =
      source.includes("attentionNote=") ||
      source.includes("handoffLinks=") ||
      source.includes("emptyStateActionLabel=") ||
      source.includes("callout=") ||
      source.includes("showAttention") ||
      source.includes("showCreate") ||
      source.includes("showActionCenter");

    assert.equal(hasWhatNextMarker, true, `${routeName} should expose at least one what-next marker.`);
  }
});

test("workspace billing aliases keep stable route entry points", () => {
  const billingSource = readSource("app/(app-shell)/app/billing/invoices/page.tsx");
  const billingRecoverySource = readSource("app/(app-shell)/app/billing/recovery/page.tsx");

  assert.equal(billingSource.includes("Billing & invoices"), true);
  assert.equal(billingRecoverySource.includes("<WorkspaceQueuePage"), true);
});

test("support/platform/account/settings routes include explicit readability cues", () => {
  const supportOverviewSource = readSource("app/(app-shell)/app/support/escalations/page.tsx");
  assert.equal(supportOverviewSource.includes("Support overview"), true);
  assert.equal(supportOverviewSource.includes("How to get help"), true);
  assert.equal(supportOverviewSource.includes("Use the channel that matches your issue"), true);

  const platformHealthSource = readSource("app/(app-shell)/app/platform/health/page.tsx");
  assert.equal(platformHealthSource.includes("Platform health"), true);
  assert.equal(platformHealthSource.includes("Customer-safe service status"), true);
  assert.equal(platformHealthSource.includes("What customers should do next"), true);

  const accountSource = readSource("app/(app-shell)/app/account/profile/page.tsx");
  assert.equal(accountSource.includes("Account workspace"), true);
  assert.equal(accountSource.includes("Account summary"), true);
  assert.equal(accountSource.includes("Open billing portal") || accountSource.includes("Open payment center"), true);

  const settingsSource = readSource("app/(app-shell)/app/account/settings/page.tsx");
  assert.equal(settingsSource.includes("Settings"), true);
  assert.equal(settingsSource.includes("Notification and contact readiness"), true);
  assert.equal(settingsSource.includes("Save preferences"), true);
});
