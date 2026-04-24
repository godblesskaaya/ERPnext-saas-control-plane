import { Chip } from "@mui/material";

import { getTenantStatusChip } from "../lib/tenantDisplayUtils";

export function TenantStatusChip({ status }: { status: string }) {
  const { color, sx } = getTenantStatusChip(status);
  return <Chip label={status} color={color} size="small" sx={sx} />;
}
