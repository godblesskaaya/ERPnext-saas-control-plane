import Link from "next/link";
import { PricingSection } from "../../domains/subscription/ui/PricingSection";

const outcomeHighlights = [
  {
    title: "Daily cashflow clarity",
    description: "Know what sold, what is due, and where money is stuck before the week closes.",
  },
  {
    title: "Stock you can trust",
    description: "Track movement by branch and warehouse so buyers reorder on time, not late.",
  },
  {
    title: "Branches in one rhythm",
    description: "Align approvals, pricing, and stock rules across locations without extra admin.",
  },
];

const sectorFocus = [
  {
    title: "Retail & FMCG",
    detail: "Fast SKU tracking, reorder signals, and branch restock discipline.",
  },
  {
    title: "Wholesale & distribution",
    detail: "Better control of credit, price lists, and dispatch reliability.",
  },
  {
    title: "Services & projects",
    detail: "Track billable work, payables, and approvals with fewer delays.",
  },
];

const goLiveSteps = [
  {
    headline: "1) Set your control room",
    points: ["Name your workspace", "Confirm business basics", "Invite your first operator"],
  },
  {
    headline: "2) Choose your operating level",
    points: ["Select a plan", "Pick your business focus", "Review TZS-first pricing guidance"],
  },
  {
    headline: "3) Go live with guardrails",
    points: ["Launch core workflows", "Track setup milestones", "Monitor daily performance"],
  },
];

const trustSignals = [
  {
    role: "Local-first guidance",
    detail: "TZS-first billing language, EAT-aligned support windows, and clear VAT-ready statements.",
  },
  {
    role: "Mobile money friendly",
    detail: "Checkout messaging supports card, bank transfer, and mobile money flows.",
  },
  {
    role: "Swahili-ready teams",
    detail: "Direct, simple copy designed for mixed-language ops teams.",
  },
];

const signalCards = [
  {
    title: "Cashflow radar",
    value: "Know what is due today",
    detail: "Spot late payers early and keep collections tight.",
  },
  {
    title: "Stock pulse",
    value: "Track fast movers",
    detail: "Stay ahead of stock-outs with branch-level visibility.",
  },
  {
    title: "Branch control",
    value: "One policy, every branch",
    detail: "Keep pricing and approvals consistent at scale.",
  },
];

export default function LandingPage() {
  return (
    <div className="space-y-24 pb-12">
      <section className="grid gap-10 rounded-2xl border border-slate-200/90 bg-white/80 p-8 shadow-[0_30px_80px_rgba(13,106,106,0.15)] lg:grid-cols-[1.2fr_0.8fr] lg:p-12">
        <div className="space-y-6 animate-rise">
          <span className="inline-flex rounded-full border border-slate-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-800">
            Built for Tanzania operating teams
          </span>
          <h1 className="font-display text-4xl leading-tight text-slate-900 md:text-5xl">
            Run cashflow, stock, and branches from one control room.
          </h1>
          <p className="max-w-2xl text-lg text-slate-600">
            Biashara Cloud is the calm, reliable layer above the daily noise. Your team sees what matters today,
            fixes issues faster, and keeps branches aligned without extra admin overhead.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Start your control room
            </Link>
            <Link
              href="/#pricing"
              className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            >
              View pricing
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1">TZS-first guidance</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Mobile money ready</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">EAT support hours</span>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-slate-50 p-6 shadow-inner">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Control room signals</p>
          {signalCards.map((card) => (
            <div key={card.title} className="rounded-xl border border-slate-200/90 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{card.title}</p>
              <p className="text-sm text-blue-700">{card.value}</p>
              <p className="text-xs text-slate-500">{card.detail}</p>
            </div>
          ))}
          <div className="rounded-xl border border-dashed border-slate-200/90 bg-white/80 px-4 py-3 text-xs text-slate-500">
            Setup guidance included. Your ops lead can follow a 3-minute checklist to get the first branch online.
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl border border-slate-200/90 bg-white/70 p-6 lg:grid-cols-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ready in days</p>
          <p className="text-2xl font-semibold text-slate-900">Launch faster, reduce chaos, keep cash moving.</p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">3-minute setup checklist</p>
          <p className="mt-1">Name your workspace, confirm business basics, invite key operators.</p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Switch without disruption</p>
          <p className="mt-1">Keep branches running while you onboard in parallel.</p>
        </div>
      </section>

      <section id="features" className="space-y-6">
        <h2 className="font-display text-3xl text-slate-900">Outcomes your team feels quickly</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {outcomeHighlights.map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-200/90 bg-white/80 p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {sectorFocus.map((item) => (
          <article key={item.title} className="rounded-2xl border border-slate-200/90 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Built for</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{item.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
          </article>
        ))}
      </section>

      <PricingSection />

      <section id="how-it-works" className="space-y-6">
        <h2 className="font-display text-3xl text-slate-900">A go-live flow built for operators</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {goLiveSteps.map((pillar) => (
            <article key={pillar.headline} className="rounded-2xl border border-slate-200/90 bg-white/80 p-5">
              <h3 className="text-lg font-semibold text-slate-900">{pillar.headline}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {pillar.points.map((point) => (
                  <li key={point}>• {point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200/90 bg-white/80 p-6">
        <h2 className="font-display text-2xl text-slate-900">Local trust and practical language</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {trustSignals.map((item) => (
            <article key={item.role} className="rounded-2xl border border-slate-200/90 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-blue-700">{item.role}</p>
              <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200/90 pt-8 text-sm text-slate-500">
        <p>© {new Date().getFullYear()} Biashara Cloud. Built to help Tanzania teams move faster with less noise.</p>
      </footer>
    </div>
  );
}
