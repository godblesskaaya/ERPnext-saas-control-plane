const EM_DASH = "—";

/**
 * Format an ISO timestamp as a human-readable date + time in the user's locale.
 * Returns em-dash for nullish values and the raw string for unparseable input.
 */
export function formatTimestamp(value?: string | null): string {
  if (!value) return EM_DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

/**
 * Format an ISO timestamp as a date only (no time). Used for billing dates,
 * trial end dates, etc. where time-of-day is noise.
 */
export function formatDate(value?: string | null): string {
  if (!value) return EM_DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

/**
 * Format an amount already expressed in major units (e.g. TZS 1,500 = value 1500).
 * Default currency is TZS — matches the dominant market for this product.
 */
export function formatAmount(value?: number | null, currency = "TZS"): string {
  if (value == null) return EM_DASH;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toFixed(0)} ${currency}`;
  }
}

/**
 * Format an amount in minor units (e.g. Stripe-style cents: value 150000 = $1,500.00).
 * Used by ERPNext invoice payloads where `amount_due` / `amount_paid` arrive as integers.
 */
export function formatMoney(amountInMinorUnits?: number | null, currency?: string | null): string {
  if (amountInMinorUnits == null) return EM_DASH;
  const code = (currency || "USD").toUpperCase();
  const major = amountInMinorUnits / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(major);
  } catch {
    return `${major.toFixed(2)} ${code}`;
  }
}
