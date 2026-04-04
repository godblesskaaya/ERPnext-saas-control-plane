"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { consumeImpersonationToken, toAuthErrorMessage } from "../../../domains/auth/application/authUseCases";
import { PublicRouteGuidance } from "../../../domains/auth/ui/PublicRouteGuidance";
import { Badge, Card } from "../../../domains/shared/components/ui";

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
      <Card className="w-full space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Support access</p>
        <h1 className="text-2xl font-semibold text-slate-900">Impersonation handoff</h1>
        <PublicRouteGuidance
          whereAmI="One-time support session handoff"
          whatNext="This token is verified automatically. On success you are redirected to workspace overview."
          nextHref="/login"
          nextLabel="Prefer normal access? Sign in manually"
        />
        {status === "running" ? <p className="text-sm text-slate-600">Verifying one-time token and signing you in…</p> : null}
        {status === "done" ? <p className="text-sm text-emerald-700">Token accepted. Redirecting to dashboard…</p> : null}
        {status === "error" ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="pt-1 text-xs text-slate-600">
          Status:
          <Badge className="ml-2">
            {status === "running" ? "in-progress" : status}
          </Badge>
        </div>
      </Card>
    </section>
  );
}
