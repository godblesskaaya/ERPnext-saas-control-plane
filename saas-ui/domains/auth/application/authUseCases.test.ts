import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  consumeImpersonationToken,
  confirmEmailVerification,
  loadAuthHealth,
  loadAuthHealthSnapshot,
  loadBillingHealth,
  loginWithPassword,
  refreshAuthSession,
  requestPasswordReset,
  signupAndLogin,
  submitPasswordReset,
} from "./authUseCases";
import { api } from "../../shared/lib/api";

const originalApi = {
  authHealth: api.authHealth,
  billingHealth: api.billingHealth,
  exchangeImpersonationToken: api.exchangeImpersonationToken,
  forgotPassword: api.forgotPassword,
  login: api.login,
  refreshToken: api.refreshToken,
  resetPassword: api.resetPassword,
  signup: api.signup,
  verifyEmail: api.verifyEmail,
};

afterEach(() => {
  api.authHealth = originalApi.authHealth;
  api.billingHealth = originalApi.billingHealth;
  api.exchangeImpersonationToken = originalApi.exchangeImpersonationToken;
  api.forgotPassword = originalApi.forgotPassword;
  api.login = originalApi.login;
  api.refreshToken = originalApi.refreshToken;
  api.resetPassword = originalApi.resetPassword;
  api.signup = originalApi.signup;
  api.verifyEmail = originalApi.verifyEmail;
});

test("loginWithPassword trims email and returns safe redirect without persisting token", async () => {
  let capturedEmail = "";
  let capturedPassword = "";

  api.login = async (email: string, password: string) => {
    capturedEmail = email;
    capturedPassword = password;
    return { access_token: "access-token", token_type: "bearer" };
  };

  const result = await loginWithPassword({
    email: "  owner@example.com  ",
    password: "secret123",
    nextPath: "https://evil.example",
    persistToken: false,
  });

  assert.equal(capturedEmail, "owner@example.com");
  assert.equal(capturedPassword, "secret123");
  assert.equal(result.redirectPath, "/dashboard");
  assert.equal(result.token.access_token, "access-token");
});

test("signupAndLogin signs up then logs in with normalized email", async () => {
  const calls: string[] = [];

  api.signup = async (email: string) => {
    calls.push(`signup:${email}`);
    return {
      id: "u-1",
      email,
      role: "owner",
      is_active: true,
      is_verified: false,
      email_verified: false,
      created_at: "2026-03-18T00:00:00Z",
    };
  };

  api.login = async (email: string) => {
    calls.push(`login:${email}`);
    return { access_token: "token-2", token_type: "bearer" };
  };

  const result = await signupAndLogin({
    email: "  founder@example.com ",
    password: "secret123",
    nextPath: "/dashboard/overview",
    persistToken: false,
  });

  assert.deepEqual(calls, ["signup:founder@example.com", "login:founder@example.com"]);
  assert.equal(result.redirectPath, "/dashboard/overview");
});

test("loadAuthHealth and loadBillingHealth map supported/unsupported/unavailable states", async () => {
  api.authHealth = async () => ({ supported: true, data: { message: "  auth-ok " } });
  api.billingHealth = async () => ({ supported: false, data: null });

  const auth = await loadAuthHealth();
  const billing = await loadBillingHealth();

  assert.deepEqual(auth, { status: "ok", message: "auth-ok" });
  assert.deepEqual(billing, { status: "unsupported", message: "unsupported" });

  api.authHealth = async () => {
    throw new Error("network down");
  };
  assert.deepEqual(await loadAuthHealth(), { status: "unavailable", message: "unavailable" });
});

test("loadAuthHealthSnapshot resolves auth and billing in one shape", async () => {
  api.authHealth = async () => ({ supported: true, data: { message: "ok" } });
  api.billingHealth = async () => ({ supported: true, data: { message: "billing" } });

  const snapshot = await loadAuthHealthSnapshot();

  assert.deepEqual(snapshot, {
    auth: { status: "ok", message: "ok" },
    billing: { status: "ok", message: "billing" },
  });
});

test("password reset and verify helpers trim inputs and apply fallback messages", async () => {
  let forgotEmail = "";
  let resetToken = "";
  let verifyToken = "";

  api.forgotPassword = async (email: string) => {
    forgotEmail = email;
    return { message: "   " };
  };
  api.resetPassword = async (token: string, newPassword: string) => {
    resetToken = `${token}|${newPassword}`;
    return { message: "  done  " };
  };
  api.verifyEmail = async (token: string) => {
    verifyToken = token;
    return { message: "" };
  };

  const forgotMessage = await requestPasswordReset("  reset@example.com ");
  const resetMessage = await submitPasswordReset(" token-1 ", "new-password");
  const verifyMessage = await confirmEmailVerification(" verify-1 ");

  assert.equal(forgotEmail, "reset@example.com");
  assert.equal(resetToken, "token-1|new-password");
  assert.equal(verifyToken, "verify-1");
  assert.equal(forgotMessage, "If the account exists, reset instructions were sent.");
  assert.equal(resetMessage, "done");
  assert.equal(verifyMessage, "Email verified successfully. You can now continue.");
});

test("refreshAuthSession and consumeImpersonationToken map auth token flows", async () => {
  api.refreshToken = async () => ({ access_token: "refresh-token", token_type: "bearer" });
  api.exchangeImpersonationToken = async (token: string) => ({
    access_token: `impersonated-${token}`,
    token_type: "bearer",
  });

  const refreshed = await refreshAuthSession();
  const impersonated = await consumeImpersonationToken(" support-token ", false);

  assert.equal(refreshed?.access_token, "refresh-token");
  assert.equal(impersonated.access_token, "impersonated-support-token");

  api.refreshToken = async () => {
    throw new Error("session expired");
  };
  const failedRefresh = await refreshAuthSession();
  assert.equal(failedRefresh, null);
});
