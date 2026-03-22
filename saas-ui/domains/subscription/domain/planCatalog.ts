import type { PlanDetail } from "../../shared/lib/types";

export type PlanCatalogItem = {
  id: string;
  slug: string;
  label: string;
  monthlyPriceLabel: string;
  monthlyPriceTzs: number;
  description: string;
  backupRetentionLabel: string;
  supportLabel: string;
  entitlements: string[];
  selectableEntitlements: string[];
  highlight?: string;
};

const fallbackDescriptions: Record<string, string> = {
  starter: "Best when one team needs sales, stock, and invoicing moving this week.",
  business: "For growing operations coordinating branches, field teams, or mobile-first workflows.",
  enterprise: "For complex governance, multi-company rollout, and guided migration planning.",
};

const fallbackHighlights: Record<string, string> = {
  business: "Best for growth",
};

function toCurrencyLabel(tzs: number): string {
  try {
    return new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(tzs);
  } catch {
    return `TZS ${tzs.toLocaleString()}`;
  }
}

export function normalizePlanCatalog(plan: PlanDetail): PlanCatalogItem {
  const slug = plan.slug.toLowerCase();
  return {
    id: plan.id,
    slug,
    label: plan.display_name,
    monthlyPriceLabel: plan.monthly_price_tzs > 0 ? `${toCurrencyLabel(plan.monthly_price_tzs)}/month` : "Custom pricing",
    monthlyPriceTzs: plan.monthly_price_tzs,
    description: fallbackDescriptions[slug] ?? "Plan for regulated, growing business operations.",
    backupRetentionLabel: `${plan.backup_retention_days}-day backups`,
    supportLabel: plan.support_channel.replaceAll("_", " "),
    entitlements: plan.entitlements.map((item) => item.app_slug),
    selectableEntitlements: plan.entitlements.filter((item) => item.selectable).map((item) => item.app_slug),
    highlight: fallbackHighlights[slug],
  };
}

export const fallbackPlanCatalog: PlanCatalogItem[] = [
  {
    id: "starter",
    slug: "starter",
    label: "Starter",
    monthlyPriceLabel: "TZS 125,000/month",
    monthlyPriceTzs: 125000,
    description: fallbackDescriptions.starter,
    backupRetentionLabel: "7-day backups",
    supportLabel: "email",
    entitlements: ["erpnext"],
    selectableEntitlements: [],
  },
  {
    id: "business",
    slug: "business",
    label: "Business",
    monthlyPriceLabel: "TZS 380,000/month",
    monthlyPriceTzs: 380000,
    description: fallbackDescriptions.business,
    backupRetentionLabel: "30-day backups",
    supportLabel: "priority email",
    entitlements: ["erpnext", "crm", "hrms", "helpdesk", "lending", "payments"],
    selectableEntitlements: ["crm", "hrms", "helpdesk", "lending", "payments"],
    highlight: "Best for growth",
  },
  {
    id: "enterprise",
    slug: "enterprise",
    label: "Enterprise",
    monthlyPriceLabel: "Custom pricing",
    monthlyPriceTzs: 0,
    description: fallbackDescriptions.enterprise,
    backupRetentionLabel: "90-day backups",
    supportLabel: "whatsapp + SLA",
    entitlements: ["erpnext", "crm", "hrms", "helpdesk", "lending", "payments", "lms", "frappe_whatsapp", "posawesome"],
    selectableEntitlements: [],
  },
];

