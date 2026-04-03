"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { confirmEmailVerification, loadAuthHealthSnapshot } from "../../../domains/auth/application/authUseCases";
import { PublicRouteGuidance } from "../../../domains/auth/ui/PublicRouteGuidance";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const initialToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState("checking");
  const [authHealth, setAuthHealth] = useState("checking");
  const [billingHealth, setBillingHealth] = useState("checking");

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!initialToken) return;
    let cancelled = false;

    const verify = async () => {
      setBusy(true);
      setError(null);
      try {
        const message = await confirmEmailVerification(initialToken);
        if (cancelled) return;
        setNotice(message);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to verify email.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [initialToken]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await confirmEmailVerification(token);
      setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-6 rounded-3xl border border-slate-200/90 bg-white/80 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Verify your email / Thibitisha barua pepe</h1>
        <p className="text-sm text-slate-600">Confirm your account email to unlock tenant creation and onboarding.</p>
      </div>

      <PublicRouteGuidance
        whereAmI="Email verification"
        whatNext="Confirm your verification token, then continue to sign in and start onboarding."
        nextHref="/login?verified=1"
        nextLabel="Continue to sign in"
      />

      <div className="rounded-2xl border border-slate-200/90 bg-white/80 p-4 text-sm text-slate-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Diagnostics</p>
        <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
            API: <span className="font-semibold">{apiHealth}</span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
            Auth: <span className="font-semibold">{authHealth}</span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
            Billing: <span className="font-semibold">{billingHealth}</span>
          </div>
        </div>
      </div>

      {!initialToken ? (
        <form className="space-y-4" onSubmit={submit}>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Verification token"
            required
          />
          <button
            className="w-full rounded-full bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Verifying..." : "Verify email"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-600">{busy ? "Verifying token..." : "Verification check complete."}</p>
      )}

      {notice ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>
      ) : null}
      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="text-sm text-slate-600">
        <Link href="/login?verified=1" className="text-blue-700 hover:text-blue-600">
          Continue to sign in
        </Link>
      </div>
    </section>
  );
}
