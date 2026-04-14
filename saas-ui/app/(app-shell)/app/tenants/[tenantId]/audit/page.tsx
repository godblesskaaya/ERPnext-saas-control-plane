"use client";

import { Alert } from "@mui/material";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  TenantActivitySection,
} from "../../../../../../domains/tenant-ops/ui/tenant-detail/sections";
import { TenantWorkspacePageLayout } from "../../../../../../domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout";
import {
  useTenantAuditData,
  useTenantRouteContext,
} from "../../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TenantAuditPage() {
  const params = useParams<{ tenantId: string }>();
  const id = params.tenantId;
  const [auditPage, setAuditPage] = useState(1);

  const auditLimit = 25;
  const { tenant, error } = useTenantRouteContext(id);
  const { auditSupported, auditError, auditLog, auditTotal, loadAudit } = useTenantAuditData(id, auditPage, auditLimit);

  const auditTotalPages = useMemo(() => Math.max(1, Math.ceil(auditTotal / auditLimit)), [auditTotal]);

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  return (
    <TenantWorkspacePageLayout
      tenantId={id}
      title="Activity log"
      tenantContext={tenant ? `${tenant.company_name} (${tenant.domain})` : "Loading tenant context..."}
      footerError={error}
    >
      <TenantActivitySection
        auditSupported={auditSupported}
        auditError={auditError}
        auditLog={auditLog}
        auditPage={auditPage}
        auditTotalPages={auditTotalPages}
        auditTotal={auditTotal}
        onRefresh={() => {
          void loadAudit();
        }}
        onPreviousPage={() => setAuditPage((prev) => Math.max(1, prev - 1))}
        onNextPage={() => setAuditPage((prev) => Math.min(auditTotalPages, prev + 1))}
        canGoPrevious={auditPage > 1}
        canGoNext={auditPage < auditTotalPages}
        formatTimestamp={formatTimestamp}
      />
    </TenantWorkspacePageLayout>
  );
}
