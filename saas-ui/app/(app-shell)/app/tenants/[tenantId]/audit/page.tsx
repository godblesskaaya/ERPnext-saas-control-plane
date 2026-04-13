import { TenantDetailScaffold, TenantSectionPlaceholder } from "../../../_components/TenantDetailScaffold";

type TenantAuditPageProps = {
  params: Promise<{
    tenantId: string;
  }>;
};

export default async function TenantAuditPage({ params }: TenantAuditPageProps) {
  const { tenantId } = await params;

  return (
    <TenantDetailScaffold
      tenantId={tenantId}
      section="audit"
      title="Tenant audit"
      subtitle="Tenant-level change history and governance."
    >
      <TenantSectionPlaceholder
        title="Audit"
        body="This canonical page now owns tenant audit trails, governance review, and operator traceability."
      />
    </TenantDetailScaffold>
  );
}
