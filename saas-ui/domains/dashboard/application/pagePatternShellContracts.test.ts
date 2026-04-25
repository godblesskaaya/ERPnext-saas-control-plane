import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

const routePaths = {
  overview: "app/(app-shell)/app/overview/page.tsx",
  list: "app/(app-shell)/app/tenants/active/page.tsx",
  queue: "app/(app-shell)/app/platform/provisioning/page.tsx",
  settings: "app/(app-shell)/app/account/settings/page.tsx",
} as const;

const queueShellPath = "domains/dashboard/components/WorkspaceQueuePage.tsx";
const listShellPath = "domains/dashboard/components/TenantTable.tsx";

test("representative overview/list/queue routes compose explicit workspace route page components", () => {
  const overviewSource = readSource(routePaths.overview);
  const listSource = readSource(routePaths.list);
  const queueSource = readSource(routePaths.queue);

  const overviewComponentSource = readSource("domains/dashboard/components/workspace-pages/OverviewWorkspacePage.tsx");
  const listComponentSource = readSource("domains/dashboard/components/workspace-pages/ActiveWorkspacesPage.tsx");
  const queueComponentSource = readSource("domains/dashboard/components/workspace-pages/ProvisioningWorkspacePage.tsx");

  assert.equal(overviewSource.includes("<OverviewWorkspacePage />"), true);
  assert.equal(listSource.includes("<ActiveWorkspacesPage />"), true);
  assert.equal(queueSource.includes("<ProvisioningWorkspacePage />"), true);

  assert.equal(overviewSource.includes("<WorkspaceQueuePage"), false);
  assert.equal(listSource.includes("<WorkspaceQueuePage"), false);
  assert.equal(queueSource.includes("<WorkspaceQueuePage"), false);

  assert.equal(overviewComponentSource.includes('routeScope="workspace"'), true);
  assert.equal(listComponentSource.includes('routeScope="workspace"'), true);
  assert.equal(queueComponentSource.includes('routeScope="workspace"'), true);
});

test("queue shell uses LoadingState/ErrorState wrappers for route-level loading and error", () => {
  const queueShellSource = readSource(queueShellPath);

  assert.equal(
    /import\s+\{\s*ErrorState,\s*LoadingState(?:,\s*PageHeader)?\s*\}\s+from\s+"..\/..\/shell\/components";/.test(queueShellSource),
    true,
    "Queue shell should import LoadingState and ErrorState primitives.",
  );

  assert.equal(queueShellSource.includes("const showRouteLoading = loading && tenants.length === 0 && !error;"), true);
  assert.equal(queueShellSource.includes("const showRouteError = Boolean(error) && tenants.length === 0;"), true);

  assert.equal(
    queueShellSource.includes('{showRouteLoading ? <LoadingState label="Loading workspace queue…" /> : null}'),
    true,
    "Queue shell should render LoadingState wrapper when route data is loading.",
  );

  assert.equal(
    queueShellSource.includes("<ErrorState") && queueShellSource.includes('message={error ?? "Failed to load workspace queue."}'),
    true,
    "Queue shell should render ErrorState wrapper when route data fails with no tenant rows.",
  );
});

test("queue shell composes page header anatomy with breadcrumbs and action zone", () => {
  const queueShellSource = readSource(queueShellPath);

  assert.equal(queueShellSource.includes("const headerCrumbs = [rootCrumb, { label: title }];"), true);
  assert.equal(queueShellSource.includes("<PageHeader"), true);
  assert.equal(queueShellSource.includes("breadcrumbs={headerCrumbs}"), true);
  assert.equal(queueShellSource.includes("actions={"), true);
  assert.equal(queueShellSource.includes("<TenantTable"), true);
});

test("list shell uses EmptyState primitive for empty wrapper", () => {
  const listShellSource = readSource(listShellPath);

  assert.equal(listShellSource.includes('import { EmptyState } from "../../shell/components";'), true);
  assert.equal(listShellSource.includes("if (!tenants.length)"), true);
  assert.equal(listShellSource.includes("<EmptyState"), true);
  assert.equal(listShellSource.includes("title={title}") && listShellSource.includes("description={body}"), true);
});

test("settings route adopts LoadingState/ErrorState/EmptyState wrappers", () => {
  const settingsSource = readSource(routePaths.settings);

  // Settings page imports the shared shell primitives (and may add PageHeader alongside them).
  assert.equal(
    /import \{[^}]*EmptyState[^}]*ErrorState[^}]*LoadingState[^}]*\} from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/domains\/shell\/components";/.test(
      settingsSource,
    ),
    true,
    "settings should import EmptyState, ErrorState, and LoadingState from the shared shell components.",
  );

  assert.equal(settingsSource.includes("const [profileLoading, setProfileLoading] = useState(true);"), true);
  assert.equal(/<LoadingState label="Loading account settings[…\.]+"/.test(settingsSource), true);
  assert.equal(settingsSource.includes("<ErrorState") && settingsSource.includes("message={error}"), true);
  assert.equal(settingsSource.includes("<EmptyState") && settingsSource.includes('title="Account profile unavailable"'), true);
});
