import Link from "next/link";

const controlHighlights = [
  {
    title: "Provisioning command center",
    description: "Create tenants, track provisioning jobs, and audit state transitions from one workspace.",
  },
  {
    title: "Plan + app orchestration",
    description: "Business plan onboarding supports app-profile selection for better fit from day one.",
  },
  {
    title: "Operational guardrails",
    description: "Secure auth, role-based admin controls, and resilient fallback behavior for API version skew.",
  },
];

const valuePillars = [
  {
    headline: "Faster tenant time-to-live",
    points: ["Guided onboarding", "Secure checkout flow", "Live job logs + progress"],
  },
  {
    headline: "More control for operators",
    points: ["Dense dashboard metrics", "Admin suspend + logs", "Backup + reset actions"],
  },
  {
    headline: "Built for production evolution",
    points: ["Graceful compatibility retries", "Provider-aware billing metadata", "Audit-ready model extensions"],
  },
];

const roleViews = [
  {
    role: "Founders / Ops",
    detail: "Launch new customer environments quickly while retaining control over plan quality and rollouts.",
  },
  {
    role: "Tenant admins",
    detail: "Self-serve onboarding with transparent status, direct ERP URL handoff, and cleaner lifecycle controls.",
  },
  {
    role: "Platform admins",
    detail: "Investigate jobs, dead letters, and tenant posture from a single control center.",
  },
];

export default function LandingPage() {
  return (
    <div className="space-y-16 pb-10">
      <section className="grid gap-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl shadow-sky-950/20 lg:grid-cols-[1.25fr_1fr] lg:p-12">
        <div className="space-y-6">
          <span className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-sky-200">
            ERPNext SaaS Control Plane
          </span>
          <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
            Redesigning ERP tenant operations for speed, clarity, and control.
          </h1>
          <p className="max-w-2xl text-lg text-slate-300">
            From landing to dashboards, the experience is tuned for action: launch faster, see more, and govern tenant lifecycle with fewer clicks.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              Start provisioning
            </Link>
            <Link
              href="/dashboard"
              className="rounded-md border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
            >
              Open dashboard
            </Link>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-sm font-medium text-slate-200">Live platform snapshot</p>
          {[
            ["Provisioning pipeline", "Healthy"],
            ["Billing webhooks", "Healthy"],
            ["Queue monitoring", "Enabled"],
            ["Admin controls", "Active"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm">
              <span className="text-slate-300">{label}</span>
              <span className="text-emerald-300">{value}</span>
            </div>
          ))}
          <p className="pt-2 text-xs text-slate-400">Designed to keep operators informed before issues become incidents.</p>
        </div>
      </section>

      <section id="features" className="space-y-6">
        <h2 className="text-3xl font-semibold text-white">Control-oriented product surface</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {controlHighlights.map((item) => (
            <article key={item.title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-3xl font-semibold text-white">Plans built for staged growth</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">Starter</p>
            <p className="mt-1 text-2xl font-bold text-sky-300">$49/mo</p>
            <p className="mt-2 text-sm text-slate-300">Rapid go-live for lean operations with essential controls.</p>
          </article>
          <article className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-5">
            <p className="text-xs uppercase tracking-wide text-sky-200">Business · Most popular</p>
            <p className="mt-1 text-2xl font-bold text-sky-100">$149/mo</p>
            <p className="mt-2 text-sm text-sky-100/90">Includes Business app selector for targeted rollout by team profile.</p>
          </article>
          <article className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">Enterprise</p>
            <p className="mt-1 text-2xl font-bold text-violet-200">Custom</p>
            <p className="mt-2 text-sm text-slate-300">Expanded governance, support SLAs, and broader operational controls.</p>
          </article>
        </div>
      </section>

      <section id="how-it-works" className="space-y-6">
        <h2 className="text-3xl font-semibold text-white">What changes after this redesign</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {valuePillars.map((pillar) => (
            <article key={pillar.headline} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="text-lg font-semibold text-white">{pillar.headline}</h3>
              <ul className="mt-3 space-y-1 text-sm text-slate-300">
                {pillar.points.map((point) => (
                  <li key={point}>• {point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-2xl font-semibold text-white">Designed for every operator role</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {roleViews.map((item) => (
            <article key={item.role} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-sm font-semibold text-sky-200">{item.role}</p>
              <p className="mt-2 text-sm text-slate-300">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-800 pt-8 text-sm text-slate-400">
        <p>© {new Date().getFullYear()} ERP SaaS Platform. Production-ready ERPNext operations, redesigned for control.</p>
      </footer>
    </div>
  );
}
