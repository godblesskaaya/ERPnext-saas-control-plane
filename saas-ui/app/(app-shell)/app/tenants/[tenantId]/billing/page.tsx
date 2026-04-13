import { TenantDetailScaffold, TenantSectionPlaceholder } from "../../../_components/TenantDetailScaffold";

type TenantBillingPageProps = {
  params: Promise<{
    tenantId: string;
  }>;
};

export default async function TenantBillingPage({ params }: TenantBillingPageProps) {
  const { tenantId } = await params;

  return (
    <TenantDetailScaffold
      tenantId={tenantId}
      section="billing"
      title="Tenant billing"
      subtitle="Payment state and billing context for this tenant."
    >
      <TenantSectionPlaceholder
        title="Billing"
        body="This canonical page now owns tenant payment state, invoice context, and billing follow-up."
      />
    </TenantDetailScaffold>
  );
}
