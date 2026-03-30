import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_PREFERENCES, fromApiPreferences, parsePreferences, toApiPreferences } from "./settingsPreferences";

test("parsePreferences returns defaults when raw is null or invalid JSON", () => {
  assert.deepEqual(parsePreferences(null), DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences("{"), DEFAULT_PREFERENCES);
});

test("parsePreferences merges partial values with defaults", () => {
  const parsed = parsePreferences(JSON.stringify({ smsAlerts: false, billingAlerts: false }));
  assert.deepEqual(parsed, {
    ...DEFAULT_PREFERENCES,
    smsAlerts: false,
    billingAlerts: false,
  });
});

test("fromApiPreferences maps snake_case payload and preserves defaults for missing keys", () => {
  assert.deepEqual(
    fromApiPreferences({
      email_alerts: true,
      sms_alerts: false,
      billing_alerts: false,
    }),
    {
      ...DEFAULT_PREFERENCES,
      smsAlerts: false,
      billingAlerts: false,
    }
  );
});

test("toApiPreferences maps camelCase preferences into API payload", () => {
  assert.deepEqual(
    toApiPreferences({
      emailAlerts: false,
      smsAlerts: true,
      billingAlerts: false,
      provisioningAlerts: true,
      supportAlerts: false,
    }),
    {
      email_alerts: false,
      sms_alerts: true,
      billing_alerts: false,
      provisioning_alerts: true,
      support_alerts: false,
    }
  );
});
