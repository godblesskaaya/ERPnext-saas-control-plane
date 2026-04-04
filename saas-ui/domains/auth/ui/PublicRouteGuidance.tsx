import Link from "next/link";
import { Card } from "../../shared/components/ui";

interface PublicRouteGuidanceProps {
  whereAmI: string;
  whatNext: string;
  nextHref?: string;
  nextLabel?: string;
}

export function PublicRouteGuidance({ whereAmI, whatNext, nextHref, nextLabel }: PublicRouteGuidanceProps) {
  return (
    <Card className="space-y-0 bg-slate-50 text-sm text-slate-700">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Where am I</h2>
      <p className="mt-1 font-medium text-slate-900">{whereAmI}</p>
      <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">What next</h3>
      <p className="mt-1">{whatNext}</p>
      {nextHref && nextLabel ? (
        <Link href={nextHref} className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-600">
          {nextLabel}
        </Link>
      ) : null}
    </Card>
  );
}
