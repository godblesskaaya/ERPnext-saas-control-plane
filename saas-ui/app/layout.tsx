import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NotificationsProvider } from "../domains/shared/components/NotificationsProvider";
import { SessionManager } from "../domains/shared/components/SessionManager";
import { MuiProviders } from "../domains/shared/components/MuiProviders";
import { QueryProvider } from "../domains/shared/query/QueryProvider";

export const metadata: Metadata = {
  title: "Biashara Cloud",
  description: "Run cashflow, stock, and branch operations in one clear control room for Tanzania teams.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f3f6fb] text-slate-900 antialiased">
        <MuiProviders>
          <QueryProvider>
            <NotificationsProvider>
              <SessionManager />
              <div className="relative min-h-screen">{children}</div>
            </NotificationsProvider>
          </QueryProvider>
        </MuiProviders>
      </body>
    </html>
  );
}
