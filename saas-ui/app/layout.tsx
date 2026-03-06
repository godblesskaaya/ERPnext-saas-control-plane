import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "ERP SaaS",
  description: "ERPNext SaaS Provisioning Portal",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto max-w-5xl p-6">{children}</main>
      </body>
    </html>
  );
}
