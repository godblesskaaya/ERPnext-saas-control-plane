import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { adminNavSections } from "../../admin-ops/domain/adminNavigation";
import { getDashboardNavSectionsByMode } from "../../dashboard/domain/navigation";
import { workspaceDescriptors } from "./workspace";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

test("dashboard shell layout composes UserShell", () => {
  const source = readSource("app/(dashboard)/layout.tsx");

  assert.equal(source.includes("UserShell"), true, "dashboard layout should reference UserShell");
  assert.equal(/<UserShell>\s*\{children\}\s*<\/UserShell>/.test(source), true);
});

test("user shell mounts workspace-local navigation before route content", () => {
  const source = readSource("domains/dashboard/components/UserShell.tsx");

  assert.equal(source.includes("WorkspaceLocalNav"), true, "user shell should include workspace-local navigation");
});

test("workspace descriptors use canonical /app/* hrefs only", () => {
  for (const descriptor of workspaceDescriptors) {
    assert.equal(
      descriptor.href.startsWith("/app/"),
      true,
      `workspace descriptor should use canonical app href: ${descriptor.href}`,
    );
  }
});

test("workspace sidebar sections keep canonical /app/* hrefs", () => {
  for (const section of getDashboardNavSectionsByMode("workspace")) {
    for (const item of section.items) {
      assert.equal(item.href.startsWith("/app/"), true, `workspace item should use canonical app href: ${item.href}`);
    }
  }
});

test("admin shell layout composes AppFrame + AdminNav and applies route access policy in a hook", () => {
  const source = readSource("app/(admin)/layout.tsx");

  assert.equal(source.includes("import { useEffect"), true, "admin layout should use useEffect hook");
  assert.equal(source.includes("decideAdminRouteAccess"), true, "admin layout should apply admin route policy");
  assert.equal(source.includes("nextPath"), true, "admin route policy should evaluate the effective nextPath");
  assert.equal(source.includes("<AppFrame"), true, "admin layout should render AppFrame");
  assert.equal(
    source.includes("sidebar={<AdminNav />}"),
    true,
    "admin layout should mount AdminNav inside AppFrame sidebar",
  );
});

test("workspace sidebar keeps sticky positioning guardrails", () => {
  const source = readSource("domains/shell/components/WorkspaceSidebar.tsx");

  assert.equal(/position:\s*"sticky"/.test(source), true, "sidebar should stay sticky");
  assert.equal(/top:\s*80/.test(source), true, "sidebar sticky top offset should remain 80");
});

test("dashboard workspace navigation never includes admin routes", () => {
  const workspaceSections = getDashboardNavSectionsByMode("workspace");

  for (const section of workspaceSections) {
    for (const item of section.items) {
      assert.equal(
        item.href.startsWith("/admin"),
        false,
        `workspace nav item should not target admin routes: ${item.href}`,
      );
    }
  }
});

test("global workspace descriptors remain the compact top-level set", () => {
  const labels = workspaceDescriptors.map((workspace) => workspace.label);
  assert.deepEqual(labels, ["Overview", "Tenants", "Billing", "Support", "Platform", "Account"]);
  assert.deepEqual(
    workspaceDescriptors.map((workspace) => workspace.href),
    ["/app/overview", "/app/tenants", "/app/billing/invoices", "/app/support/queue", "/app/platform/provisioning", "/app/account/profile"],
  );
});

test("admin navigation sections only expose admin-prefixed routes", () => {
  for (const section of adminNavSections) {
    for (const item of section.items) {
      assert.equal(
        item.href.startsWith("/app/admin"),
        true,
        `admin nav item should stay in admin namespace: ${item.href}`,
      );
    }
  }
});
