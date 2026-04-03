export type TokenPayload = {
  exp?: number;
  role?: string;
  sub?: string;
  [key: string]: unknown;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function createFakeJwt(payload: TokenPayload = {}): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = base64UrlEncode(
    JSON.stringify({ sub: "e2e-user", exp: Math.floor(Date.now() / 1000) + 3600, ...payload }),
  );
  return `${header}.${body}.sig`;
}
