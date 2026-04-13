"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { loadAuthHealthSnapshot, requestPasswordReset } from "../../../domains/auth/application/authUseCases";
import { getToken } from "../../../domains/auth/auth";
import { PublicRouteGuidance } from "../../../domains/auth/ui/PublicRouteGuidance";
import { Badge, Button, Card, Input } from "../../../domains/shared/components/ui";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState("checking");
  const [authHealth, setAuthHealth] = useState("checking");
  const [billingHealth, setBillingHealth] = useState("checking");

  useEffect(() => {
    if (getToken()) {
      router.replace("/app/overview");
      return;
    }

    const loadHealth = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        setApiHealth(response.ok ? "ok" : "unavailable");
      } catch {
        setApiHealth("unavailable");
      }

      const health = await loadAuthHealthSnapshot();
      setAuthHealth(health.auth.message);
      setBillingHealth(health.billing.message);
    };

    void loadHealth();
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await requestPasswordReset(email);
      setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process password reset request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Reset access / Rekebisha nenosiri</h1>
        <p className="text-sm text-slate-600">
          Enter your account email. If it exists, we will send a one-time token for password reset.
        </p>
      </div>

      <PublicRouteGuidance
        whereAmI="Password recovery"
        whatNext="Submit your email, check your inbox for a one-time reset token, then set a new password."
        nextHref="/login"
        nextLabel="Back to sign in"
      />

      <div className="rounded-2xl border border-slate-200/90 bg-white/80 p-4 text-sm text-slate-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Diagnostics</p>
        <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
            API: <Badge className="ml-1">{apiHealth}</Badge>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
            Auth: <Badge className="ml-1">{authHealth}</Badge>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
            Billing: <Badge className="ml-1">{billingHealth}</Badge>
          </div>
        </div>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <Input
          label="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          type="email"
          required
        />
        <Button className="w-full" loading={busy}>
          {busy ? "Sending..." : "Send reset instructions"}
        </Button>
      </form>

      {notice ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>
      ) : null}
      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <p className="text-sm text-slate-600">
        Remembered your password?{" "}
        <Link href="/login" className="text-blue-700 hover:text-blue-600">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
