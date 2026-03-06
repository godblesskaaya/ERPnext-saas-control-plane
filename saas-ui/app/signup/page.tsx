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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api.signup(email, password);
      const token = await api.login(email, password);
      saveToken(token.access_token);
      router.push("/onboarding?welcome=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create your account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Create your account</h1>
        <p className="text-sm text-slate-300">You&apos;ll continue directly to onboarding after signup.</p>
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
          {busy ? "Creating account..." : "Create account"}
        </button>
      </form>

      {error ? <p className="rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}

      <p className="text-sm text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="text-sky-300 hover:text-sky-200">
          Sign in
        </Link>
      </p>
    </section>
  );
}
