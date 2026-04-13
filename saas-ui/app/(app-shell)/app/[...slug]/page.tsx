import { notFound } from "next/navigation";

export default function AppCatchAllRoute() {
  // AGENT-NOTE: Canonical `/app/*` paths now have explicit pages. Keep catch-all
  // strictly for unknown paths so migration gaps are visible and intentional.
  notFound();
}
