import "./globals.css";
import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Business Operations Cloud",
  description: "Launch faster with clearer cashflow, inventory, and branch operations in one place.",
};

type SessionPayload = {
  exp?: number;
  role?: string;
  email?: string;
  sub?: string;
};

function parseToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  try {
    const [, payload] = token.split(".");
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
}

function isExpired(payload: SessionPayload | null): boolean {
  if (!payload?.exp) return false;
  return payload.exp * 1000 <= Date.now();
}

const navLinkClass =
  "rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("erp_saas_token")?.value;
  const payload = parseToken(token);
  const authenticated = Boolean(token) && !isExpired(payload);
  const role = payload?.role;
  const userLabel = payload?.email ?? payload?.sub;

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <div className="relative min-h-screen">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(99,102,241,0.15),transparent_30%)]" />

          <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
            <div className="border-b border-slate-800/70 bg-slate-900/80 px-6 py-1.5 text-center text-[11px] text-slate-300">
              TZS-friendly pricing guidance • Mobile-money compatible checkout providers • Support hours in EAT
            </div>
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
              <div className="flex items-center gap-4">
                <Link href="/" className="text-lg font-semibold tracking-tight text-white">
                  Biashara Cloud
                </Link>
                <nav className="hidden items-center gap-1 md:flex">
                  <Link href="/#features" className={navLinkClass}>
                    Outcomes
                  </Link>
                  <Link href="/#pricing" className={navLinkClass}>
                    Pricing
                  </Link>
                  <Link href="/#how-it-works" className={navLinkClass}>
                    Go-live flow
                  </Link>
                </nav>
              </div>

              <div className="flex items-center gap-2">
                {authenticated ? (
                  <>
                    <Link href="/onboarding" className={navLinkClass}>
                      Onboarding
                    </Link>
                    <Link href="/dashboard" className={navLinkClass}>
                      Dashboard
                    </Link>
                    {role === "admin" ? (
                      <Link href="/admin" className={navLinkClass}>
                        Admin
                      </Link>
                    ) : null}
                    <span className="hidden rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 md:inline-flex">
                      {userLabel ? `${userLabel}${role ? ` (${role})` : ""}` : "Signed in"}
                    </span>
                    <Link
                      href="/login?logout=1"
                      className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
                    >
                      Logout
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/login" className={navLinkClass}>
                      Sign in
                    </Link>
                    <Link
                      href="/signup"
                      className="rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400"
                    >
                      Start now
                    </Link>
                  </>
                )}
              </div>
            </div>
          </header>

          <main className="relative mx-auto max-w-6xl px-6 py-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
