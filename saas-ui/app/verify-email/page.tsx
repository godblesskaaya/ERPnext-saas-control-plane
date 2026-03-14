"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const initialToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!initialToken) return;
    let cancelled = false;

    const verify = async () => {
      setBusy(true);
      setError(null);
      try {
        const result = await api.verifyEmail(initialToken);
        if (cancelled) return;
        setNotice(result.message || "Email verified successfully. You can now continue.");
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
      const result = await api.verifyEmail(token.trim());
      setNotice(result.message || "Email verified successfully. You can now continue.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Verify your email / Thibitisha barua pepe</h1>
        <p className="text-sm text-slate-300">Confirm your account email to unlock tenant creation and onboarding.</p>
      </div>

      {!initialToken ? (
        <form className="space-y-4" onSubmit={submit}>
          <input
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Verification token"
            required
          />
          <button
            className="w-full rounded-md bg-sky-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Verifying..." : "Verify email"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-300">{busy ? "Verifying token..." : "Verification check complete."}</p>
      )}

      {notice ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{notice}</p>
      ) : null}
      {error ? <p className="rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}

      <div className="text-sm text-slate-400">
        <Link href="/login?verified=1" className="text-sky-300 hover:text-sky-200">
          Continue to sign in
        </Link>
      </div>
    </section>
  );
}
