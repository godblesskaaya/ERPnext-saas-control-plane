import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

const routePaths = {
  overview: "app/(dashboard)/dashboard/overview/page.tsx",
  list: "app/(dashboard)/dashboard/active/page.tsx",
  queue: "app/(dashboard)/dashboard/provisioning/page.tsx",
  settings: "app/(dashboard)/dashboard/settings/page.tsx",
} as const;

const queueShellPath = "domains/dashboard/components/WorkspaceQueuePage.tsx";
const listShellPath = "domains/dashboard/components/TenantTable.tsx";

test("representative overview/list/queue routes compose the shared queue shell primitive", () => {
  for (const [routeName, routePath] of Object.entries({
    overview: routePaths.overview,
    list: routePaths.list,
    queue: routePaths.queue,
  })) {
    const source = readSource(routePath);

    assert.equal(source.includes("<WorkspaceQueuePage"), true, `${routeName} route should render WorkspaceQueuePage.`);
    assert.equal(source.includes('routeScope="workspace"'), true, `${routeName} route should stay workspace scoped.`);
  }
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
    queueShellSource.includes("<ErrorState") && queueShellSource.includes("message={error ?? \"Failed to load workspace queue.\"}"),
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

  assert.equal(
    settingsSource.includes('import { EmptyState, ErrorState, LoadingState } from "../../../../domains/shell/components";'),
    true,
  );

  assert.equal(settingsSource.includes("const [profileLoading, setProfileLoading] = useState(true);"), true);
  assert.equal(settingsSource.includes('{profileLoading ? <LoadingState label="Loading account settings..." /> : null}'), true);
  assert.equal(settingsSource.includes("<ErrorState") && settingsSource.includes("message={error}"), true);
  assert.equal(settingsSource.includes('<EmptyState') && settingsSource.includes('title="Account profile unavailable"'), true);
});
