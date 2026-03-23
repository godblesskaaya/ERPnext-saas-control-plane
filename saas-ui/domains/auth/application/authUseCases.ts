import { saveToken } from "../auth";
import { normalizeHealthMessage, safePostLoginRedirect, sanitizeAuthEmail } from "../domain/authPolicies";
import {
  authHealth,
  billingHealth,
  exchangeImpersonationToken,
  forgotPassword,
  login,
  refreshSessionToken,
  resetPassword,
  subscribeAuthSessionExpired,
  signup,
  verifyEmail,
  type AuthToken,
} from "../infrastructure/authRepository";
import { getApiErrorMessage } from "../../shared/lib/api";

export type HealthStatus = "checking" | "ok" | "unsupported" | "unavailable";

export type ServiceHealth = {
  status: HealthStatus;
  message: string;
};

export type AuthHealthSnapshot = {
  auth: ServiceHealth;
  billing: ServiceHealth;
};

export type LoginInput = {
  email: string;
  phone?: string | null;
  password: string;
  nextPath?: string | null;
  persistToken?: boolean;
};

export type LoginResult = {
  token: AuthToken;
  redirectPath: string;
};

async function resolveServiceHealth(
  serviceCall: () => Promise<{ supported: boolean; data: { message: string } | null }>
): Promise<ServiceHealth> {
  try {
    const result = await serviceCall();
    if (!result.supported) {
      return { status: "unsupported", message: "unsupported" };
    }
    return {
      status: "ok",
      message: normalizeHealthMessage(result.data?.message, "ok"),
    };
  } catch {
    return { status: "unavailable", message: "unavailable" };
  }
}

export async function loadAuthHealth(): Promise<ServiceHealth> {
  return resolveServiceHealth(authHealth);
}

export async function loadBillingHealth(): Promise<ServiceHealth> {
  return resolveServiceHealth(billingHealth);
}

export async function loadAuthHealthSnapshot(): Promise<AuthHealthSnapshot> {
  const [auth, billing] = await Promise.all([loadAuthHealth(), loadBillingHealth()]);
  return { auth, billing };
}

export async function loginWithPassword(input: LoginInput): Promise<LoginResult> {
  const token = await login(sanitizeAuthEmail(input.email), input.password);
  if (input.persistToken !== false) {
    saveToken(token.access_token);
  }
  return {
    token,
    redirectPath: safePostLoginRedirect(input.nextPath ?? null),
  };
}

export async function signupAndLogin(input: LoginInput): Promise<LoginResult> {
  const email = sanitizeAuthEmail(input.email);
  await signup(email, input.password, input.phone);

  const token = await login(email, input.password);
  if (input.persistToken !== false) {
    saveToken(token.access_token);
  }

  return {
    token,
    redirectPath: safePostLoginRedirect(input.nextPath ?? null),
  };
}

export async function requestPasswordReset(email: string): Promise<string> {
  const response = await forgotPassword(sanitizeAuthEmail(email));
  return normalizeHealthMessage(response.message, "If the account exists, reset instructions were sent.");
}

export async function submitPasswordReset(token: string, newPassword: string): Promise<string> {
  const response = await resetPassword(token.trim(), newPassword);
  return normalizeHealthMessage(response.message, "Password reset successful. You can sign in now.");
}

export async function confirmEmailVerification(token: string): Promise<string> {
  const response = await verifyEmail(token.trim());
  return normalizeHealthMessage(response.message, "Email verified successfully. You can now continue.");
}

export async function refreshAuthSession(): Promise<AuthToken | null> {
  try {
    return await refreshSessionToken();
  } catch {
    return null;
  }
}

export async function consumeImpersonationToken(token: string, persistToken = true): Promise<AuthToken> {
  const next = await exchangeImpersonationToken(token.trim());
  if (persistToken) {
    saveToken(next.access_token);
  }
  return next;
}

export function onAuthSessionExpired(listener: () => void): () => void {
  return subscribeAuthSessionExpired(listener);
}

export function toAuthErrorMessage(error: unknown, fallback: string): string {
  return getApiErrorMessage(error, fallback);
}

export { safePostLoginRedirect };
