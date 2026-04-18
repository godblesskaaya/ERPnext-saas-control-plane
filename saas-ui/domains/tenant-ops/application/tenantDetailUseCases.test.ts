import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { renewTenantCheckout } from "./tenantDetailUseCases";
import { api } from "../../shared/lib/api";

const originalRenewCheckout = api.renewCheckout;

afterEach(() => {
  api.renewCheckout = originalRenewCheckout;
});

test("renewTenantCheckout proxies checkout renewal endpoint", async () => {
  api.renewCheckout = async (tenantId) => {
    assert.equal(tenantId, "tenant-42");
    return {
      supported: true,
      data: {
        tenant: {
          id: "tenant-42",
          owner_id: "owner-1",
          subdomain: "northwind",
          domain: "northwind.example.com",
          site_name: "northwind",
          company_name: "Northwind",
          plan: "starter",
          status: "pending_payment",
          created_at: "2026-04-15T00:00:00Z",
          updated_at: "2026-04-15T00:00:00Z",
        },
        checkout_url: "https://checkout.example.com/session/renewed",
        checkout_expires_at: "2026-04-16T00:00:00Z",
      },
    };
  };

  const result = await renewTenantCheckout("tenant-42");
  assert.equal(result.supported, true);
  assert.equal(result.data.checkout_url, "https://checkout.example.com/session/renewed");
});
