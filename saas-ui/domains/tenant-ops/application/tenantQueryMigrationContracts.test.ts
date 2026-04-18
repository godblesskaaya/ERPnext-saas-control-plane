import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

test("tenant workspace query foundation is wired at shell boundary", () => {
  const layoutSource = readSource("app/layout.tsx");
  const providerSource = readSource("domains/shared/query/QueryProvider.tsx");
  const queryClientSource = readSource("domains/shared/query/queryClient.ts");

  assert.equal(layoutSource.includes('import { QueryProvider } from "../domains/shared/query/QueryProvider";'), true);
  assert.equal(layoutSource.includes("<QueryProvider>"), true);
  assert.equal(layoutSource.includes("</QueryProvider>"), true);

  assert.equal(providerSource.includes('import { QueryClientProvider } from "@tanstack/react-query";'), true);
  assert.equal(providerSource.includes("createQueryClient"), true);

  assert.equal(queryClientSource.includes("new QueryClient"), true);
  assert.equal(queryClientSource.includes("queries:"), true);
  assert.equal(queryClientSource.includes("mutations:"), true);
});

test("tenant detail hooks expose query-backed route/members/subscription reads with invalidation refresh", () => {
  const hooksSource = readSource("domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData.ts");

  for (const marker of [
    'import { useQuery, useQueryClient } from "@tanstack/react-query"',
    "tenantDetailQueryKeys",
    "members:",
    "subscription:",
    "useTenantRouteContext",
    "useTenantMembersData",
    "useTenantSubscriptionData",
    "useQuery<",
    "invalidateQueries",
  ]) {
    assert.equal(hooksSource.includes(marker), true, `expected marker missing from tenant query hooks: ${marker}`);
  }
});

test("overview/members/billing pages consume query hooks and keep mutation-driven refresh behavior", () => {
  const overviewSource = readSource("app/(app-shell)/app/tenants/[tenantId]/overview/page.tsx");
  const membersSource = readSource("app/(app-shell)/app/tenants/[tenantId]/members/page.tsx");
  const billingSource = readSource("app/(app-shell)/app/tenants/[tenantId]/billing/page.tsx");

  assert.equal(
    overviewSource.includes("useTenantRouteContext") &&
      overviewSource.includes("useTenantRecentJobsData") &&
      overviewSource.includes("useTenantSubscriptionData"),
    true,
  );
  assert.equal(overviewSource.includes("Payment recovery") && overviewSource.includes("Resume checkout"), true);

  assert.equal(membersSource.includes("useTenantMembersData"), true, "Members page should read member data via query hooks.");
  assert.equal(membersSource.includes("useMutation") && membersSource.includes("invalidateQueries"), true);
  assert.equal(
    membersSource.includes("tenantDetailQueryKeys.members(id)") && membersSource.includes("tenantDetailQueryKeys.tenant(id)"),
    true,
    "Members mutations should invalidate both members list + route context tenant query keys.",
  );

  assert.equal(billingSource.includes("useTenantSubscriptionData"), true);
  assert.equal(billingSource.includes("onRefresh={() => {") && billingSource.includes("loadSubscription"), true);
});
