import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NotificationsProvider } from "../domains/shared/components/NotificationsProvider";
import { SessionManager } from "../domains/shared/components/SessionManager";

export const metadata: Metadata = {
  title: "Biashara Cloud",
  description: "Run cashflow, stock, and branch operations in one clear control room for Tanzania teams.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f5f1e8] text-slate-900 antialiased">
        <NotificationsProvider>
          <SessionManager />
          <div className="relative min-h-screen overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(13,106,106,0.18),transparent_45%),radial-gradient(circle_at_85%_5%,rgba(242,161,72,0.22),transparent_35%),linear-gradient(120deg,rgba(255,255,255,0.8),rgba(255,255,255,0.1))]" />
            <div className="pointer-events-none absolute -left-24 top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.25),transparent_70%)] blur-2xl animate-drift" />
            <div className="pointer-events-none absolute -right-32 top-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.25),transparent_65%)] blur-2xl animate-drift" />
            <div className="relative">{children}</div>
          </div>
        </NotificationsProvider>
      </body>
    </html>
  );
}
