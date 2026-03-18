import type { BillingInvoice } from "../../shared/lib/types";

export type Invoice = BillingInvoice;

export type InvoiceSummary = {
  overdueCount: number;
  paidCount: number;
  channelCounts: Record<string, number>;
  collectionCounts: Record<string, number>;
  providerCounts: Record<string, number>;
};

export function paymentChannelFromInvoice(invoice: Invoice): string {
  if (invoice.collection_method === "platform_erp") return "Invoice";
  const methodTypes = invoice.payment_method_types ?? [];
  if (methodTypes.some((type) => type.includes("card"))) return "Card";
  if (methodTypes.some((type) => type.includes("mobile_money"))) return "Mobile money";
  if (methodTypes.some((type) => type.includes("bank") || type.includes("transfer") || type.includes("customer_balance"))) {
    return "Bank transfer";
  }
  if (invoice.collection_method === "send_invoice") return "Invoice";
  return "Unknown";
}

export function providerFromInvoice(invoice: Invoice): string | null {
  if (invoice.collection_method === "platform_erp") {
    return "ERPNext";
  }
  const metadata = invoice.metadata ?? {};
  const provider =
    (metadata["payment_provider"] as string | undefined) ||
    (metadata["mobile_money_provider"] as string | undefined) ||
    (metadata["provider"] as string | undefined) ||
    (metadata["gateway"] as string | undefined);
  return provider ? provider.replace(/_/g, " ") : null;
}

export function summarizeInvoices(invoices: Invoice[]): InvoiceSummary {
  const channelCounts: Record<string, number> = {};
  const collectionCounts: Record<string, number> = {};
  const providerCounts: Record<string, number> = {};

  let overdueCount = 0;
  let paidCount = 0;

  invoices.forEach((invoice) => {
    const status = invoice.status?.toLowerCase() ?? "";
    if (status === "paid") paidCount += 1;
    if (["past_due", "unpaid", "open", "cancelled"].includes(status)) overdueCount += 1;

    const channel = paymentChannelFromInvoice(invoice);
    channelCounts[channel] = (channelCounts[channel] ?? 0) + 1;

    const method = invoice.collection_method ?? "unknown";
    collectionCounts[method] = (collectionCounts[method] ?? 0) + 1;

    const provider = providerFromInvoice(invoice) ?? "Unknown";
    providerCounts[provider] = (providerCounts[provider] ?? 0) + 1;
  });

  return {
    overdueCount,
    paidCount,
    channelCounts,
    collectionCounts,
    providerCounts,
  };
}
