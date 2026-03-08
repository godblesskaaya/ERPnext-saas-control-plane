import Link from "next/link";

const outcomeHighlights = [
  {
    title: "Cashflow visibility every day",
    description: "See what is selling, what is due, and what needs follow-up before it hurts your month-end.",
  },
  {
    title: "Inventory you can trust",
    description: "Track stock movement across stores and warehouses so purchasing decisions stay proactive.",
  },
  {
    title: "Branch operations in sync",
    description: "Keep branch teams aligned with one operational rhythm across sales, stock, and approvals.",
  },
];

const goLiveSteps = [
  {
    headline: "1) Start in minutes",
    points: ["Create your workspace", "Set business details", "Invite key team members"],
  },
  {
    headline: "2) Configure with confidence",
    points: ["Choose your plan", "Review pricing clearly", "Continue with guided onboarding"],
  },
  {
    headline: "3) Go live faster",
    points: ["Activate core workflows", "Monitor setup progress", "Launch daily operations quickly"],
  },
];

const trustSignals = [
  {
    role: "TZS-friendly pricing context",
    detail: "Plan cards can be presented with Tanzania-focused language and optional TZS estimate guidance at checkout.",
  },
  {
    role: "Mobile-money compatible wording",
    detail: "Checkout messaging supports teams that collect with cards, bank transfer, or mobile-money compatible providers.",
  },
  {
    role: "Swahili/English friendly copy",
    detail: "Product language is simple, direct, and easy to use for mixed-language business teams.",
  },
];

export default function LandingPage() {
  return (
    <div className="space-y-16 pb-10">
      <section className="grid gap-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl shadow-sky-950/20 lg:grid-cols-[1.25fr_1fr] lg:p-12">
        <div className="space-y-6">
          <span className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-sky-200">
            Built for Tanzania growth teams
          </span>
          <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
            Better cashflow control, tighter inventory, and smoother branch operations.
          </h1>
          <p className="max-w-2xl text-lg text-slate-300">
            Give your team a faster go-live path with clear business visibility from day one. Designed for practical operations, not technical overhead.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              Start your setup
            </Link>
            <Link
              href="/#pricing"
              className="rounded-md border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
            >
              View plans
            </Link>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-sm font-medium text-slate-200">What improves in week one</p>
          {[
            ["Daily cash position", "Clearer view"],
            ["Stock status by location", "Fewer surprises"],
            ["Branch coordination", "Faster decisions"],
            ["Time to operational go-live", "Shorter setup"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm">
              <span className="text-slate-300">{label}</span>
              <span className="text-emerald-300">{value}</span>
            </div>
          ))}
          <p className="pt-2 text-xs text-slate-400">Simple onboarding flow built to help teams move from setup to daily use quickly.</p>
        </div>
      </section>

      <section id="features" className="space-y-6">
        <h2 className="text-3xl font-semibold text-white">Outcomes your team can feel quickly</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {outcomeHighlights.map((item) => (
            <article key={item.title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-3xl font-semibold text-white">Clear pricing for growing businesses</h2>
        <p className="max-w-3xl text-sm text-slate-300">
          Use your preferred checkout method with clear billing language and practical TZS guidance.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">Starter</p>
            <p className="mt-1 text-2xl font-bold text-sky-300">$49/mo</p>
            <p className="text-xs text-slate-400">About TZS 125,000/month</p>
            <p className="mt-2 text-sm text-slate-300">Great for new teams moving from spreadsheets to structured daily operations.</p>
          </article>
          <article className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-5">
            <p className="text-xs uppercase tracking-wide text-sky-200">Business · Most selected</p>
            <p className="mt-1 text-2xl font-bold text-sky-100">$149/mo</p>
            <p className="text-xs text-sky-200/80">About TZS 380,000/month</p>
            <p className="mt-2 text-sm text-sky-100/90">For multi-branch teams that need tighter stock control and stronger reporting rhythm.</p>
          </article>
          <article className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">Enterprise</p>
            <p className="mt-1 text-2xl font-bold text-violet-200">Custom</p>
            <p className="mt-2 text-sm text-slate-300">Tailored rollout support for complex operations and advanced governance needs.</p>
          </article>
        </div>
      </section>

      <section id="how-it-works" className="space-y-6">
        <h2 className="text-3xl font-semibold text-white">A faster go-live flow</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {goLiveSteps.map((pillar) => (
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
        <h2 className="text-2xl font-semibold text-white">Local trust and practical language</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {trustSignals.map((item) => (
            <article key={item.role} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-sm font-semibold text-sky-200">{item.role}</p>
              <p className="mt-2 text-sm text-slate-300">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-800 pt-8 text-sm text-slate-400">
        <p>© {new Date().getFullYear()} Biashara Cloud. Built to help teams in Tanzania launch faster and run cleaner operations.</p>
      </footer>
    </div>
  );
}
