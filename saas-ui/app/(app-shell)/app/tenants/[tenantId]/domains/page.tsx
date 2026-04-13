import { TenantDetailScaffold, TenantSectionPlaceholder } from "../../../_components/TenantDetailScaffold";

type TenantDomainsPageProps = {
  params: Promise<{
    tenantId: string;
  }>;
};

export default async function TenantDomainsPage({ params }: TenantDomainsPageProps) {
  const { tenantId } = await params;

  return (
    <TenantDetailScaffold
      tenantId={tenantId}
      section="domains"
      title="Tenant domains"
      subtitle="DNS and domain readiness for the tenant."
    >
      <TenantSectionPlaceholder
        title="Domains"
        body="This canonical page now owns domain readiness, verification, and DNS state for the tenant."
      />
    </TenantDetailScaffold>
  );
}
