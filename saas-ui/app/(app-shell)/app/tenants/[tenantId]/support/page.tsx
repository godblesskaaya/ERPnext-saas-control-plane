import { TenantDetailScaffold, TenantSectionPlaceholder } from "../../../_components/TenantDetailScaffold";

type TenantSupportPageProps = {
  params: Promise<{
    tenantId: string;
  }>;
};

export default async function TenantSupportPage({ params }: TenantSupportPageProps) {
  const { tenantId } = await params;

  return (
    <TenantDetailScaffold
      tenantId={tenantId}
      section="support"
      title="Tenant support"
      subtitle="Support notes and follow-up for this tenant."
    >
      <TenantSectionPlaceholder
        title="Support"
        body="This canonical page now owns tenant support notes, escalation context, and operator follow-up."
      />
    </TenantDetailScaffold>
  );
}
