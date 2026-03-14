"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../lib/api";
import { saveToken } from "../../lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await api.signup(email, password);
      const token = await api.login(email, password);
      saveToken(token.access_token);
      setNotice("Account created. Please verify your email from your inbox before creating a workspace.");
      router.push("/dashboard?verifyEmail=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create your account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Create your account / Fungua akaunti</h1>
        <p className="text-sm text-slate-300">Create your account, verify your email, then continue onboarding.</p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
        <p className="font-medium text-slate-200">Before you continue</p>
        <ul className="mt-2 space-y-1">
          <li>• Pricing can be communicated with Tanzania-focused context, including TZS estimate wording.</li>
          <li>• Checkout language is suitable for teams using card or mobile-money compatible payment providers.</li>
          <li>• Interface copy is intentionally easy to follow for Swahili and English speaking teams.</li>
        </ul>
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
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          minLength={8}
          required
        />
        <button
          className="w-full rounded-md bg-sky-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Creating account..." : "Create account and continue"}
        </button>
      </form>

      {notice ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{notice}</p>
      ) : null}
      {error ? <p className="rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}

      <p className="text-sm text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="text-sky-300 hover:text-sky-200">
          Sign in now
        </Link>
      </p>
    </section>
  );
}
