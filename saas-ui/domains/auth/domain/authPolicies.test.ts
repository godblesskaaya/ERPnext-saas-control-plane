import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_POST_LOGIN_REDIRECT,
  normalizeHealthMessage,
  safePostLoginRedirect,
  sanitizeAuthEmail,
} from "./authPolicies";

test("safePostLoginRedirect uses fallback for invalid values", () => {
  assert.equal(safePostLoginRedirect(null), DEFAULT_POST_LOGIN_REDIRECT);
  assert.equal(safePostLoginRedirect(""), DEFAULT_POST_LOGIN_REDIRECT);
  assert.equal(safePostLoginRedirect("https://evil.example"), DEFAULT_POST_LOGIN_REDIRECT);
  assert.equal(safePostLoginRedirect("//evil.example"), DEFAULT_POST_LOGIN_REDIRECT);
  assert.equal(safePostLoginRedirect("settings", "/home"), "/home");
});

test("safePostLoginRedirect allows rooted app paths", () => {
  assert.equal(safePostLoginRedirect("/dashboard"), "/dashboard");
  assert.equal(safePostLoginRedirect("/dashboard?tab=billing"), "/dashboard?tab=billing");
});

test("sanitizeAuthEmail trims leading and trailing whitespace", () => {
  assert.equal(sanitizeAuthEmail("  owner@example.com  "), "owner@example.com");
});

test("normalizeHealthMessage trims payload values and falls back when empty", () => {
  assert.equal(normalizeHealthMessage("  healthy  ", "fallback"), "healthy");
  assert.equal(normalizeHealthMessage("   ", "fallback"), "fallback");
  assert.equal(normalizeHealthMessage(undefined, "fallback"), "fallback");
});
