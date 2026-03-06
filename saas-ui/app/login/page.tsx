"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../lib/api";
import { saveToken } from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const token = await api.login(email, password);
      saveToken(token.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Login</h1>
      <form className="space-y-3" onSubmit={submit}>
        <input className="w-full rounded border border-slate-600 bg-slate-900 p-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input className="w-full rounded border border-slate-600 bg-slate-900 p-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <button className="rounded bg-blue-600 px-4 py-2">Login</button>
      </form>
      {error ? <p className="text-red-400">{error}</p> : null}
    </section>
  );
}
