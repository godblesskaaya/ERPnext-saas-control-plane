import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <header className="border-b border-amber-100/70 bg-[#f7f2e9]/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
            Biashara Cloud
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/login"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 transition hover:border-slate-300"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-[#0d6a6a] px-3 py-1.5 font-semibold text-white transition hover:bg-[#0b5a5a]"
            >
              Start now
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-5xl items-center justify-center px-6 py-10">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
