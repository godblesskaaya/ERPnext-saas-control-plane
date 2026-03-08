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
    <section className="mx-auto max-w-xl space-y-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Reset access / Rekebisha nenosiri</h1>
        <p className="text-sm text-slate-300">
          Enter your account email. If it exists, we will send a one-time token for password reset.
        </p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          type="email"
          required
        />
        <button
          className="w-full rounded-md bg-sky-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Sending..." : "Send reset instructions"}
        </button>
      </form>

      {notice ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{notice}</p>
      ) : null}
      {error ? <p className="rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}

      <p className="text-sm text-slate-400">
        Remembered your password?{" "}
        <Link href="/login" className="text-sky-300 hover:text-sky-200">
          Back to sign in
        </Link>
      </p>
    </section>
  );
}
