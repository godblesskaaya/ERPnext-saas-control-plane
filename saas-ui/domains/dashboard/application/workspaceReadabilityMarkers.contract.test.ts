import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

const workspaceQueueRoutes = {
  overview: {
    route: "app/(app-shell)/app/overview/page.tsx",
    component: "domains/dashboard/components/workspace-pages/OverviewWorkspacePage.tsx",
    componentName: "OverviewWorkspacePage",
  },
  registry: {
    route: "app/(app-shell)/app/tenants/page.tsx",
    component: "domains/dashboard/components/workspace-pages/TenantRegistryWorkspacePage.tsx",
    componentName: "TenantRegistryWorkspacePage",
  },
  active: {
    route: "app/(app-shell)/app/tenants/active/page.tsx",
    component: "domains/dashboard/components/workspace-pages/ActiveWorkspacesPage.tsx",
    componentName: "ActiveWorkspacesPage",
  },
  billingRecovery: {
    route: "app/(app-shell)/app/billing/recovery/page.tsx",
    component: "domains/dashboard/components/workspace-pages/BillingRecoveryWorkspacePage.tsx",
    componentName: "BillingRecoveryWorkspacePage",
  },
  support: {
    route: "app/(app-shell)/app/support/queue/page.tsx",
    component: "domains/dashboard/components/workspace-pages/SupportQueueWorkspacePage.tsx",
    componentName: "SupportQueueWorkspacePage",
  },
  provisioning: {
    route: "app/(app-shell)/app/platform/provisioning/page.tsx",
    component: "domains/dashboard/components/workspace-pages/ProvisioningWorkspacePage.tsx",
    componentName: "ProvisioningWorkspacePage",
  },
  incidents: {
    route: "app/(app-shell)/app/platform/incidents/page.tsx",
    component: "domains/dashboard/components/workspace-pages/IncidentsWorkspacePage.tsx",
    componentName: "IncidentsWorkspacePage",
  },
  onboarding: {
    route: "app/(app-shell)/app/platform/onboarding/page.tsx",
    component: "domains/dashboard/components/workspace-pages/OnboardingWorkspacePage.tsx",
    componentName: "OnboardingWorkspacePage",
  },
} as const;

test("workspace queue routes expose readability markers (where am I, what is this, what next)", () => {
  for (const [routeName, routeConfig] of Object.entries(workspaceQueueRoutes)) {
    const routeSource = readSource(routeConfig.route);
    const componentSource = readSource(routeConfig.component);

    assert.equal(routeSource.includes(routeConfig.componentName), true, `${routeName} route should use ${routeConfig.componentName}.`);
    assert.equal(routeSource.includes("<WorkspaceQueuePage"), false, `${routeName} route should avoid direct generic queue shell usage.`);

    assert.equal(componentSource.includes("<WorkspaceQueuePage"), true, `${routeName} component should compose queue shell.`);
    assert.equal(/\btitle="[^"]+"/.test(componentSource), true, `${routeName} should declare a title marker.`);
    assert.equal(/\bdescription="[^"]+"/.test(componentSource), true, `${routeName} should declare a purpose description marker.`);

    const hasWhatNextMarker =
      componentSource.includes("attentionNote=") ||
      componentSource.includes("handoffLinks=") ||
      componentSource.includes("emptyStateActionLabel=") ||
      componentSource.includes("callout=") ||
      componentSource.includes("showAttention") ||
      componentSource.includes("showCreate") ||
      componentSource.includes("showActionCenter");

    assert.equal(hasWhatNextMarker, true, `${routeName} should expose at least one what-next marker.`);
  }
});

test("workspace billing aliases keep stable route entry points", () => {
  const billingSource = readSource("app/(app-shell)/app/billing/invoices/page.tsx");
  const billingRecoveryRoute = readSource("app/(app-shell)/app/billing/recovery/page.tsx");
  const billingRecoveryComponent = readSource("domains/dashboard/components/workspace-pages/BillingRecoveryWorkspacePage.tsx");

  // Page now uses PageHeader with title="Invoices" and overline="Billing".
  assert.equal(billingSource.includes('title="Invoices"') && billingSource.includes('overline="Billing"'), true);
  assert.equal(billingRecoveryRoute.includes("BillingRecoveryWorkspacePage"), true);
  assert.equal(billingRecoveryComponent.includes("<WorkspaceQueuePage"), true);
});

test("support/platform/account/settings routes include explicit readability cues", () => {
  // Each page should clearly say what it is (overline + title) and what to do (action button or CTA).
  const supportOverviewSource = readSource("app/(app-shell)/app/support/escalations/page.tsx");
  assert.equal(supportOverviewSource.includes('overline="Support"') && supportOverviewSource.includes('title="Get help"'), true);
  assert.equal(supportOverviewSource.includes("Open support queue"), true, "support page should expose the primary CTA");

  const platformHealthSource = readSource("app/(app-shell)/app/platform/health/page.tsx");
  assert.equal(
    platformHealthSource.includes('overline="Platform"') && platformHealthSource.includes('title="Service status"'),
    true,
  );
  assert.equal(platformHealthSource.includes("Contact support"), true, "platform health should offer a follow-up action");

  const accountSource = readSource("app/(app-shell)/app/account/profile/page.tsx");
  assert.equal(accountSource.includes('overline="Account"') && accountSource.includes('title="Profile"'), true);
  assert.equal(
    accountSource.includes("Open invoice portal") || accountSource.includes("View invoices"),
    true,
    "account profile should link to billing follow-up",
  );

  const settingsSource = readSource("app/(app-shell)/app/account/settings/page.tsx");
  assert.equal(settingsSource.includes('overline="Account"') && settingsSource.includes('title="Settings"'), true);
  assert.equal(settingsSource.includes("Save preferences"), true);
});
