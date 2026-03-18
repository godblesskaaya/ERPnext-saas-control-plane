export const DEFAULT_POST_LOGIN_REDIRECT = "/dashboard";

export function safePostLoginRedirect(nextParam: string | null, fallback = DEFAULT_POST_LOGIN_REDIRECT): string {
  if (!nextParam || !nextParam.startsWith("/") || nextParam.startsWith("//")) {
    return fallback;
  }
  return nextParam;
}

export function sanitizeAuthEmail(email: string): string {
  return email.trim();
}

export function normalizeHealthMessage(message: string | null | undefined, fallback: string): string {
  const normalized = message?.trim();
  return normalized || fallback;
}
