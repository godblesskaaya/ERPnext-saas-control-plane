"use client";

import { useState } from "react";
import { api } from "../../lib/api";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await api.signup(email, password);
    setMessage("Account created. You can now log in.");
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Sign Up</h1>
      <form className="space-y-3" onSubmit={submit}>
        <input className="w-full rounded border border-slate-600 bg-slate-900 p-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input className="w-full rounded border border-slate-600 bg-slate-900 p-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <button className="rounded bg-blue-600 px-4 py-2">Create account</button>
      </form>
      {message ? <p className="text-green-400">{message}</p> : null}
    </section>
  );
}
