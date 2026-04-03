import Link from "next/link";

interface PublicRouteGuidanceProps {
  whereAmI: string;
  whatNext: string;
  nextHref?: string;
  nextLabel?: string;
}

export function PublicRouteGuidance({ whereAmI, whatNext, nextHref, nextLabel }: PublicRouteGuidanceProps) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-slate-50 p-4 text-sm text-slate-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Where am I</p>
      <p className="mt-1 font-medium text-slate-900">{whereAmI}</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">What next</p>
      <p className="mt-1">{whatNext}</p>
      {nextHref && nextLabel ? (
        <Link href={nextHref} className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-600">
          {nextLabel}
        </Link>
      ) : null}
    </div>
  );
}
