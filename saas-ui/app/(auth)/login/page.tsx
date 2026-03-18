"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadAuthHealthSnapshot, loginWithPassword, safePostLoginRedirect } from "../../../domains/auth/application/authUseCases";
import { clearToken, getToken } from "../../../domains/auth/auth";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState("checking");
  const [authHealth, setAuthHealth] = useState("checking");
  const [billingHealth, setBillingHealth] = useState("checking");

  const nextPath = useMemo(
    () => safePostLoginRedirect(searchParams.get("next")),
    [searchParams],
  );

  useEffect(() => {
    const sessionExpired = searchParams.get("sessionExpired") === "1";
    const logout = searchParams.get("logout") === "1";
    const verified = searchParams.get("verified") === "1";
    const verifyEmail = searchParams.get("verifyEmail") === "1";

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

    if (verified) {
      setNotice("Email verified successfully. You can continue.");
    } else if (verifyEmail) {
      setNotice("Please verify your email before creating a workspace.");
    }

    if (getToken()) {
      router.replace(nextPath);
    }
  }, [nextPath, router, searchParams]);

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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await loginWithPassword({ email, password, nextPath });
      router.replace(result.redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-6 rounded-3xl border border-amber-200/70 bg-white/80 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Welcome back / Karibu tena</h1>
        <p className="text-sm text-slate-600">Sign in to continue tracking cashflow, inventory, and branch operations.</p>
      </div>

      <div className="rounded-2xl border border-amber-200/70 bg-[#fdf7ee] p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Built for practical local operations</p>
        <ul className="mt-2 space-y-1">
          <li>• Swahili/English-friendly product wording</li>
          <li>• Clear plan pricing language with optional TZS context</li>
          <li>• Checkout messaging aligned to card and mobile-money compatible flows</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-amber-200/70 bg-white/80 p-4 text-sm text-slate-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Diagnostics</p>
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

      {notice ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{notice}</p> : null}

      <form className="space-y-4" onSubmit={submit}>
        <input
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          type="email"
          required
        />
        <input
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          minLength={8}
          required
        />
        <button
          className="w-full rounded-full bg-[#0d6a6a] px-4 py-2 font-semibold text-white transition hover:bg-[#0b5a5a] disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Signing in..." : "Access my workspace"}
        </button>
      </form>

      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <p className="text-sm text-slate-600">
        Forgot password?{" "}
        <Link href="/forgot-password" className="text-[#0d6a6a] hover:text-[#0b5a5a]">
          Reset access
        </Link>
      </p>

      <p className="text-sm text-slate-600">
        Need an account to get started quickly?{" "}
        <Link href="/signup" className="text-[#0d6a6a] hover:text-[#0b5a5a]">
          Create account
        </Link>
      </p>
    </section>
  );
}
