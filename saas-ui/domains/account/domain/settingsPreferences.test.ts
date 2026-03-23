import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_PREFERENCES, parsePreferences } from "./settingsPreferences";

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
