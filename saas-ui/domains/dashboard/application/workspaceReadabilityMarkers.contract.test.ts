import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

const workspaceQueueRoutes = {
  overview: "app/(dashboard)/dashboard/overview/page.tsx",
  registry: "app/(dashboard)/dashboard/registry/page.tsx",
  active: "app/(dashboard)/dashboard/active/page.tsx",
  billingRecovery: "app/(dashboard)/dashboard/billing-ops/page.tsx",
  support: "app/(dashboard)/dashboard/support/page.tsx",
  provisioning: "app/(dashboard)/dashboard/provisioning/page.tsx",
  incidents: "app/(dashboard)/dashboard/incidents/page.tsx",
  onboarding: "app/(dashboard)/dashboard/onboarding/page.tsx",
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
  const billingSource = readSource("app/(dashboard)/dashboard/billing/page.tsx");
  const billingRecoveryAlias = readSource("app/(dashboard)/dashboard/billing-recovery/page.tsx");

  assert.equal(billingSource.includes('export { default } from "../../../(billing)/billing/page";'), true);
  assert.equal(billingRecoveryAlias.includes('export { default } from "../billing-ops/page";'), true);
});

test("support/platform/account/settings routes include explicit readability cues", () => {
  const supportOverviewSource = readSource("app/(dashboard)/dashboard/support-overview/page.tsx");
  assert.equal(supportOverviewSource.includes("Support overview"), true);
  assert.equal(supportOverviewSource.includes("How to get help"), true);
  assert.equal(supportOverviewSource.includes("Use the channel that matches your issue"), true);

  const platformHealthSource = readSource("app/(dashboard)/dashboard/platform-health/page.tsx");
  assert.equal(platformHealthSource.includes("Platform health"), true);
  assert.equal(platformHealthSource.includes("Customer-safe service status"), true);
  assert.equal(platformHealthSource.includes("What customers should do next"), true);

  const accountSource = readSource("app/(dashboard)/dashboard/account/page.tsx");
  assert.equal(accountSource.includes("Account workspace"), true);
  assert.equal(accountSource.includes("Account summary"), true);
  assert.equal(accountSource.includes("Open billing portal") || accountSource.includes("Open payment center"), true);

  const settingsSource = readSource("app/(dashboard)/dashboard/settings/page.tsx");
  assert.equal(settingsSource.includes("Settings"), true);
  assert.equal(settingsSource.includes("Notification and contact readiness"), true);
  assert.equal(settingsSource.includes("Save preferences"), true);
});
