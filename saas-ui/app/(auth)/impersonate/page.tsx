"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { consumeImpersonationToken, toAuthErrorMessage } from "../../../domains/auth/application/authUseCases";

export default function ImpersonatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token")?.trim();
    if (!token) {
      setStatus("error");
      setError("Missing impersonation token.");
      return;
    }
    let active = true;
    setStatus("running");
    setError(null);
    void (async () => {
      try {
        await consumeImpersonationToken(token);
        if (!active) return;
        setStatus("done");
        router.replace("/dashboard/overview?impersonation=active");
      } catch (err) {
        if (!active) return;
        setStatus("error");
        setError(toAuthErrorMessage(err, "Failed to consume impersonation token."));
      }
    })();
    return () => {
      active = false;
    };
  }, [router, searchParams]);

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-4">
      <div className="w-full rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Support access</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Impersonation handoff</h1>
        {status === "running" ? <p className="mt-3 text-sm text-slate-600">Verifying one-time token and signing you in…</p> : null}
        {status === "done" ? <p className="mt-3 text-sm text-emerald-700">Token accepted. Redirecting to dashboard…</p> : null}
        {status === "error" ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}
