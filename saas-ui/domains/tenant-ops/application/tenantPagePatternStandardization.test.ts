import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const tenantPages = [
  "overview/page.tsx",
  "billing/page.tsx",
  "jobs/page.tsx",
  "backups/page.tsx",
  "domains/page.tsx",
  "members/page.tsx",
  "audit/page.tsx",
  "support/page.tsx",
];

function readTenantPageSource(pagePath: string): string {
  return readFileSync(resolve(process.cwd(), `app/(dashboard)/tenants/[id]/${pagePath}`), "utf8");
}

test("tenant detail pages follow the shared tenant page pattern", () => {
  for (const pagePath of tenantPages) {
    const source = readTenantPageSource(pagePath);

    assert.equal(
      /useParams<\{\s*id:\s*string\s*\}>\(\)/.test(source),
      true,
      `${pagePath} should read tenant id via route params.`,
    );

    assert.equal(
      source.includes("useTenantRouteContext"),
      true,
      `${pagePath} should consume tenant route context.`,
    );

    assert.equal(
      source.includes("TenantSectionLinks") || source.includes("TenantWorkspacePageLayout"),
      true,
      `${pagePath} should use shared tenant navigation directly or through TenantWorkspacePageLayout.`,
    );

    assert.equal(
      /<TenantSectionLinks\s+tenantId=\{id\}\s*\/>/.test(source) ||
        /<TenantWorkspacePageLayout[\s\S]*tenantId=\{id\}/.test(source),
      true,
      `${pagePath} should render shared tenant navigation either directly or via page layout wrapper.`,
    );
  }
});

test("tenant pages stay free of legacy section-anchor coupling", () => {
  const legacySignals = ["TenantDetailSectionAnchor", "routeSectionToAnchor"];

  for (const pagePath of tenantPages) {
    const source = readTenantPageSource(pagePath);
    for (const signal of legacySignals) {
      assert.equal(
        source.includes(signal),
        false,
        `${pagePath} should not depend on legacy anchor-driven tenant section signal: ${signal}`,
      );
    }
  }
});
