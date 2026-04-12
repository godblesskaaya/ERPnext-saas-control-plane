export type SessionPayload = {
  exp?: number;
  role?: string;
};

export type AdminRouteAccessDecision =
  | { allow: true }
  | {
      allow: false;
      status: 401 | 403;
      redirectPath: string;
      reason: "session-expired" | "unauthenticated" | "admin-required";
    };

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }

  return atob(padded);
}

export function parseSessionToken(token: string | null): SessionPayload | null {
  if (!token) return null;

  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    return JSON.parse(decodeBase64Url(payload)) as SessionPayload;
  } catch {
    return null;
  }
}

export function hasLiveSession(payload: SessionPayload | null, nowMs = Date.now()): boolean {
  if (!payload?.exp) return false;
  return payload.exp * 1000 > nowMs;
}

export function isAdminSession(payload: SessionPayload | null): boolean {
  return payload?.role === "admin" || payload?.role === "support";
}

export function buildLoginRedirectPath(nextPath: string, sessionExpired: boolean): string {
  const params = new URLSearchParams({ next: nextPath });
  if (sessionExpired) {
    params.set("sessionExpired", "1");
  }
  return `/login?${params.toString()}`;
}

export function decideAdminRouteAccess(options: {
  payload: SessionPayload | null;
  hadToken: boolean;
  nextPath: string;
  nowMs?: number;
}): AdminRouteAccessDecision {
  const { payload, hadToken, nextPath, nowMs } = options;

  if (!hasLiveSession(payload, nowMs)) {
    return {
      allow: false,
      status: 401,
      reason: hadToken ? "session-expired" : "unauthenticated",
      redirectPath: buildLoginRedirectPath(nextPath, hadToken),
    };
  }

  if (!isAdminSession(payload)) {
    return {
      allow: false,
      status: 403,
      reason: "admin-required",
      redirectPath: "/dashboard/overview?reason=admin-required",
    };
  }

  return { allow: true };
}
