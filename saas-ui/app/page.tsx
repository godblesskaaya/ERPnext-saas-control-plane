export default function LandingPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">ERPNext SaaS Platform</h1>
      <p>Create and manage your ERPNext tenant in under one minute.</p>
      <div className="space-x-3">
        <a href="/signup" className="rounded bg-blue-600 px-3 py-2">
          Create Account
        </a>
        <a href="/login" className="rounded border border-slate-500 px-3 py-2">
          Login
        </a>
      </div>
    </section>
  );
}
