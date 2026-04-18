import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

test("tenant overview payment recovery keeps billing gate markers", () => {
  const source = readSource("app/(app-shell)/app/tenants/[tenantId]/overview/page.tsx");

  for (const marker of [
    "PAYMENT_RECOVERY_STATUSES",
    "PAYMENT_RECOVERY_INVOICE_STATUSES",
    "PAYMENT_RECOVERY_SUBSCRIPTION_STATUSES",
    "Payment recovery",
    "Resume checkout",
    "Open payment center",
    "Open tenant billing",
    '["pending", "pending_payment"].includes(tenantStatus)',
    "renewTenantCheckout",
  ]) {
    assert.equal(source.includes(marker), true, `missing tenant overview billing recovery marker: ${marker}`);
  }
});

test("checkout resume flow keeps interaction-level open-tab behavior markers", () => {
  const tenantOverviewSource = readSource("app/(app-shell)/app/tenants/[tenantId]/overview/page.tsx");
  const billingOpsSource = readSource("app/(app-shell)/app/admin/billing-ops/page.tsx");

  for (const marker of [
    'window.open(result.data.checkout_url, "_blank", "noopener,noreferrer")',
    'setRecoveryNotice("Checkout link opened in a new tab.")',
    '{resumingCheckout ? "Opening checkout..." : "Resume checkout"}',
  ]) {
    assert.equal(
      tenantOverviewSource.includes(marker),
      true,
      `missing tenant overview checkout interaction marker: ${marker}`,
    );
  }

  for (const marker of [
    'window.open(checkoutUrl, "_blank", "noopener,noreferrer")',
    'setResumeNotice("Checkout link generated and opened in a new tab.")',
    '{resumeBusyTenantId === tenant.tenant_id ? "Generating..." : "Resume checkout"}',
  ]) {
    assert.equal(billingOpsSource.includes(marker), true, `missing billing ops checkout interaction marker: ${marker}`);
  }
});

test("tenant overview unsuspend control keeps explicit unsuspend contract markers", () => {
  const source = readSource("app/(app-shell)/app/tenants/[tenantId]/overview/page.tsx");

  for (const marker of [
    "unsuspendTenantAccess",
    "Unsuspend tenant",
    "Tenant unsuspended successfully.",
    "Unsuspend action is not enabled on this backend.",
  ]) {
    assert.equal(source.includes(marker), true, `missing tenant unsuspend contract marker: ${marker}`);
  }
});

test("admin billing ops keeps resume-checkout guard rails", () => {
  const source = readSource("app/(app-shell)/app/admin/billing-ops/page.tsx");

  for (const marker of [
    "renewTenantCheckout",
    "Resume checkout",
    'tenant.status !== "pending_payment"',
    "!canRunAdminOnlyActions",
    "Only admin role can resume checkout links.",
    "Checkout renewal endpoint is not enabled on this backend.",
    "Billing provider did not return a checkout URL.",
    "href={`/app/tenants/${tenant.tenant_id}/billing`}",
  ]) {
    assert.equal(source.includes(marker), true, `missing admin billing-ops marker: ${marker}`);
  }
});

test("tenant detail sections keep billing-block UX markers for gated actions", () => {
  const backupsSource = readSource("app/(app-shell)/app/tenants/[tenantId]/backups/page.tsx");
  const membersSource = readSource("app/(app-shell)/app/tenants/[tenantId]/members/page.tsx");

  for (const marker of [
    'blockedActionReason("Backup restore")',
    "disabled={billingBlocked || !entry.id || restoreBusy}",
    'blockedActionReason("Team membership updates")',
    "disabled={billingBlocked || inviteMutation.isPending || !inviteEmail.trim()}",
  ]) {
    const inBackups = backupsSource.includes(marker);
    const inMembers = membersSource.includes(marker);
    assert.equal(inBackups || inMembers, true, `missing tenant detail billing-block marker: ${marker}`);
  }
});

test("admin tenant console keeps billing suspension unsuspend guard rails", () => {
  const source = readSource("domains/admin-ops/components/admin-console/_components/AdminTenantsView.tsx");

  for (const marker of [
    'normalizedStatus === "suspended_billing"',
    "disabled={busyTenantId === tenant.id || billingSuspended}",
    '"Resolve billing"',
  ]) {
    assert.equal(source.includes(marker), true, `missing admin unsuspend billing marker: ${marker}`);
  }
});
