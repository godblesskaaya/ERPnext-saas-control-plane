"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { clearToken, getToken, saveToken } from "../../lib/auth";

function safeRedirectPath(nextParam: string | null): string {
  if (!nextParam || !nextParam.startsWith("/") || nextParam.startsWith("//")) {
    return "/dashboard";
  }
  return nextParam;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const nextPath = useMemo(
    () => safeRedirectPath(searchParams.get("next")),
    [searchParams],
  );

  useEffect(() => {
    const sessionExpired = searchParams.get("sessionExpired") === "1";
    const logout = searchParams.get("logout") === "1";

    if (logout) {
      clearToken();
      setNotice("You have been logged out.");
      return;
    }

    if (sessionExpired) {
      clearToken();
      setNotice("Your session expired. Please sign in again.");
      return;
    }

    if (getToken()) {
      router.replace(nextPath);
    }
  }, [nextPath, router, searchParams]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const token = await api.login(email, password);
      saveToken(token.access_token);
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Welcome back / Karibu tena</h1>
        <p className="text-sm text-slate-300">Sign in to continue tracking cashflow, inventory, and branch operations.</p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
        <p className="font-medium text-slate-200">Built for practical local operations</p>
        <ul className="mt-2 space-y-1">
          <li>• Swahili/English-friendly product wording</li>
          <li>• Clear plan pricing language with optional TZS context</li>
          <li>• Checkout messaging aligned to card and mobile-money compatible flows</li>
        </ul>
      </div>

      {notice ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-950/40 p-3 text-sm text-amber-100">{notice}</p>
      ) : null}

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
          {busy ? "Signing in..." : "Access my workspace"}
        </button>
      </form>

      {error ? <p className="rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}

      <p className="text-sm text-slate-400">
        Need an account to get started quickly?{" "}
        <Link href="/signup" className="text-sky-300 hover:text-sky-200">
          Create account
        </Link>
      </p>
    </section>
  );
}
