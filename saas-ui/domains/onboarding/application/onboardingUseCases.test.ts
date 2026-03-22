import test from "node:test";
import assert from "node:assert/strict";

import { parsePersistedOnboardingState } from "./onboardingUseCases";

test("parsePersistedOnboardingState parses valid payload with defaults", () => {
  const parsed = parsePersistedOnboardingState(
    JSON.stringify({
      step: "payment",
      subdomain: "alpha",
      companyName: "Alpha Corp",
      tenantId: "tenant-42",
      checkoutUrl: "https://checkout",
      jobId: "job-42",
    })
  );

  assert.deepEqual(parsed, {
    step: "payment",
    subdomain: "alpha",
    companyName: "Alpha Corp",
    plan: "starter",
    chosenApp: "erpnext",
    tenantId: "tenant-42",
    checkoutUrl: "https://checkout",
    jobId: "job-42",
  });
});

test("parsePersistedOnboardingState normalizes invalid step and nullable fields", () => {
  const parsed = parsePersistedOnboardingState(
    JSON.stringify({
      step: "not-a-step",
      subdomain: 55,
      companyName: null,
      plan: "business",
      chosenApp: "hr",
      tenantId: 123,
      checkoutUrl: false,
      jobId: 999,
    })
  );

  assert.deepEqual(parsed, {
    step: "details",
    subdomain: "",
    companyName: "",
    plan: "business",
    chosenApp: "hr",
    tenantId: null,
    checkoutUrl: null,
    jobId: null,
  });
});

test("parsePersistedOnboardingState returns null for invalid JSON", () => {
  assert.equal(parsePersistedOnboardingState("{"), null);
  assert.equal(parsePersistedOnboardingState(null), null);
});
