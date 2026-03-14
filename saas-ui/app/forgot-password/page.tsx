"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.forgotPassword(email.trim());
      setNotice(response.message || "If the account exists, reset instructions were sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process password reset request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-6 rounded-3xl border border-amber-200/70 bg-white/80 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Reset access / Rekebisha nenosiri</h1>
        <p className="text-sm text-slate-600">
          Enter your account email. If it exists, we will send a one-time token for password reset.
        </p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <input
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          type="email"
          required
        />
        <button
          className="w-full rounded-full bg-[#0d6a6a] px-4 py-2 font-semibold text-white transition hover:bg-[#0b5a5a] disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Sending..." : "Send reset instructions"}
        </button>
      </form>

      {notice ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>
      ) : null}
      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <p className="text-sm text-slate-600">
        Remembered your password?{" "}
        <Link href="/login" className="text-[#0d6a6a] hover:text-[#0b5a5a]">
          Back to sign in
        </Link>
      </p>
    </section>
  );
}
