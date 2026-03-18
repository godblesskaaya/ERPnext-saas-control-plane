import "./globals.css";
import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NotificationBell } from "../domains/shared/components/NotificationBell";
import { NotificationsProvider } from "../domains/shared/components/NotificationsProvider";
import { SessionManager } from "../domains/shared/components/SessionManager";

export const metadata: Metadata = {
  title: "Biashara Cloud",
  description: "Run cashflow, stock, and branch operations in one clear control room for Tanzania teams.",
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
  "rounded-full px-3 py-1.5 text-sm text-slate-700 transition hover:bg-white/70 hover:text-slate-900";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("erp_saas_token")?.value;
  const payload = parseToken(token);
  const authenticated = Boolean(token) && !isExpired(payload);
  const role = payload?.role;
  const userLabel = payload?.email ?? payload?.sub;

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f5f1e8] text-slate-900 antialiased">
        <NotificationsProvider>
          <SessionManager />
          <div className="relative min-h-screen overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(13,106,106,0.18),transparent_45%),radial-gradient(circle_at_85%_5%,rgba(242,161,72,0.22),transparent_35%),linear-gradient(120deg,rgba(255,255,255,0.8),rgba(255,255,255,0.1))]" />
          <div className="pointer-events-none absolute -left-24 top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.25),transparent_70%)] blur-2xl animate-drift" />
          <div className="pointer-events-none absolute -right-32 top-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.25),transparent_65%)] blur-2xl animate-drift" />

          <header className="sticky top-0 z-20 border-b border-amber-100/70 bg-[#f7f2e9]/80 backdrop-blur">
            <div className="border-b border-amber-100/70 bg-white/70 px-6 py-1.5 text-center text-[11px] text-slate-600">
              TZS-first billing guidance • Mobile money friendly checkout • Support hours aligned to EAT
            </div>
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
              <div className="flex items-center gap-4">
                <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
                  Biashara Cloud
                </Link>
                <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-800 md:inline-flex">
                  Tanzania operations control room
                </span>
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
                    <Link href="/dashboard/overview" className={navLinkClass}>
                      Dashboard
                    </Link>
                    <Link href="/dashboard/billing" className={navLinkClass}>
                      Billing
                    </Link>
                    {role === "admin" ? (
                      <Link href="/admin" className={navLinkClass}>
                        Admin
                      </Link>
                    ) : null}
                    <NotificationBell />
                    <span className="hidden rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs text-slate-600 md:inline-flex">
                      {userLabel ? `${userLabel}${role ? ` (${role})` : ""}` : "Signed in"}
                    </span>
                    <Link
                      href="/login?logout=1"
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
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
                      className="rounded-full bg-[#0d6a6a] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#0b5a5a]"
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
        </NotificationsProvider>
      </body>
    </html>
  );
}
