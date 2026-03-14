"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../../domains/shared/lib/api";

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
    <section className="mx-auto max-w-xl space-y-6 rounded-3xl border border-amber-200/70 bg-white/80 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Verify your email / Thibitisha barua pepe</h1>
        <p className="text-sm text-slate-600">Confirm your account email to unlock tenant creation and onboarding.</p>
      </div>

      {!initialToken ? (
        <form className="space-y-4" onSubmit={submit}>
          <input
            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Verification token"
            required
          />
          <button
            className="w-full rounded-full bg-[#0d6a6a] px-4 py-2 font-semibold text-white transition hover:bg-[#0b5a5a] disabled:opacity-60"
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
        <Link href="/login?verified=1" className="text-[#0d6a6a] hover:text-[#0b5a5a]">
          Continue to sign in
        </Link>
      </div>
    </section>
  );
}
