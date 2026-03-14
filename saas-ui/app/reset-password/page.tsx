"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { api } from "../../lib/api";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const initialToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!token.trim()) {
      setError("Reset token is required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await api.resetPassword(token.trim(), newPassword);
      setNotice(response.message || "Password reset successful. You can sign in now.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-6 rounded-3xl border border-amber-200/70 bg-white/80 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Set new password / Weka nenosiri jipya</h1>
        <p className="text-sm text-slate-600">Use your one-time token and choose a new password for your account.</p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <input
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Reset token"
          autoComplete="one-time-code"
          required
        />
        <input
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="New password"
          minLength={8}
          required
        />
        <input
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirm new password"
          minLength={8}
          required
        />
        <button
          className="w-full rounded-full bg-[#0d6a6a] px-4 py-2 font-semibold text-white transition hover:bg-[#0b5a5a] disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Updating..." : "Reset password"}
        </button>
      </form>

      {notice ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>
      ) : null}
      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <p className="text-sm text-slate-600">
        Continue to{" "}
        <Link href="/login" className="text-[#0d6a6a] hover:text-[#0b5a5a]">
          sign in
        </Link>
        .
      </p>
    </section>
  );
}
