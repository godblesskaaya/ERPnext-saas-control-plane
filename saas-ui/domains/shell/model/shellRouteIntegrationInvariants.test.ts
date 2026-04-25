import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buildAppNavSections } from "../../../app/(app-shell)/app/_components/appNavigation";
import { getDashboardNavSectionsByMode } from "../../dashboard/domain/navigation";
import { workspaceDescriptors } from "./workspace";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

test("canonical app layout composes AppShell", () => {
  const source = readSource("app/(app-shell)/app/layout.tsx");

  assert.equal(source.includes("AppShell"), true, "app layout should reference AppShell");
  assert.equal(/<AppShell>\s*\{children\}\s*<\/AppShell>/.test(source), true);
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

test("canonical app shell applies admin route policy and exposes admin nav sections", () => {
  const source = readSource("app/(app-shell)/app/_components/AppShell.tsx");

  assert.equal(source.includes("decideAdminRouteAccess"), true, "app shell should apply admin route policy");
  assert.equal(source.includes('pathname.startsWith("/app/admin")'), true, "app shell should gate /app/admin routes");
  assert.equal(source.includes("buildAppNavSections"), true, "app shell should derive unified sidebar sections");
  assert.equal(source.includes("canSeeAdmin"), true, "app shell should toggle admin section visibility by session role");
});

test("workspace sidebar keeps sticky positioning guardrails", () => {
  const frameSource = readSource("domains/shell/components/AppFrame.tsx");

  // Sticky positioning now lives on the sidebar grid column inside AppFrame so
  // sticky behavior is not blocked by an overflow-x ancestor. The independent
  // scroll guard (maxHeight + overflowY) keeps the nav reachable on tall content.
  assert.equal(frameSource.includes('position: "sticky"'), true, "frame should pin the sidebar column.");
  assert.equal(frameSource.includes("top: 80"), true, "sticky offset should remain 80 below the top header.");
  assert.equal(
    frameSource.includes('maxHeight: "calc(100vh - 96px)"'),
    true,
    "sidebar column should cap height so its content can scroll independently.",
  );
  assert.equal(frameSource.includes('overflowY: "auto"'), true, "sidebar column should allow internal vertical scroll.");
});

test("app frame keeps responsive drawer and avoids overflow-x sticky traps", () => {
  const source = readSource("domains/shell/components/AppFrame.tsx");

  assert.equal(source.includes("Drawer"), true, "app frame should provide a mobile drawer shell");
  assert.equal(source.includes('display: { xs: "none", lg: "block" }'), true, "desktop sidebar should hide on small screens");
  assert.equal(source.includes('display: { xs: "block", lg: "none" }'), true, "mobile drawer should only render on small screens");
  // Outer wrappers must NOT set overflow-x — that creates a scroll containing
  // block which traps position: sticky for the sidebar.
  assert.equal(source.includes('overflowX: "clip"'), false, "outer frame must not set overflow-x: clip (breaks sticky).");
});

test("top header exposes mobile navigation trigger while remaining sticky", () => {
  const source = readSource("domains/shell/components/AppTopHeader.tsx");

  assert.equal(source.includes("onOpenMobileNav"), true, "top header should accept mobile nav trigger callback");
  assert.equal(source.includes("MenuIcon"), true, "top header should render menu trigger icon for mobile");
  assert.equal(source.includes("position=\"sticky\""), true, "top header should remain sticky");
});

test("app frame preserves mobile-first single-column layout before desktop split", () => {
  const source = readSource("domains/shell/components/AppFrame.tsx");

  assert.equal(source.includes('gridTemplateColumns: contextRail ? { xs: "1fr", lg: "240px minmax(0,1fr) 300px" }'), true);
  assert.equal(source.includes(': { xs: "1fr", lg: "240px minmax(0,1fr)" }'), true);
  assert.equal(source.includes("py: { xs: 2, md: 3 }"), true);
});

test("app top header keeps mobile viewport guardrails", () => {
  const source = readSource("domains/shell/components/AppTopHeader.tsx");

  assert.equal(source.includes("position=\"sticky\""), true, "header should remain sticky during route changes.");
  // Compact mobile height — value must stay within the 56-64px range.
  const heightMatch = source.match(/minHeight: \{ xs: (\d+), md: (\d+) \}/);
  assert.notEqual(heightMatch, null, "header should declare a responsive minHeight.");
  if (heightMatch) {
    const xs = Number(heightMatch[1]);
    const md = Number(heightMatch[2]);
    assert.equal(xs >= 56 && xs <= 64, true, `mobile header height should be 56-64, got ${xs}.`);
    assert.equal(md >= 56 && md <= 72, true, `desktop header height should be 56-72, got ${md}.`);
  }
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
  for (const section of buildAppNavSections(true)) {
    if (section.title !== "Admin") continue;
    for (const item of section.items) {
      assert.equal(
        item.href.startsWith("/app/admin"),
        true,
        `admin nav item should stay in admin namespace: ${item.href}`,
      );
    }
  }
});
