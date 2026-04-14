"use client";

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";

import type { TenantAdminAction } from "./adminConsoleTypes";

type TenantActionModalProps = {
  tenantAction: TenantAdminAction | null;
  tenantActionInput: string;
  onTenantActionInputChange: (value: string) => void;
  tenantActionReason: string;
  onTenantActionReasonChange: (value: string) => void;
  busyTenantId: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TenantActionModal({
  tenantAction,
  tenantActionInput,
  onTenantActionInputChange,
  tenantActionReason,
  onTenantActionReasonChange,
  busyTenantId,
  onCancel,
  onConfirm,
}: TenantActionModalProps) {
  if (!tenantAction) {
    return null;
  }

  return (
    <Dialog open onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{tenantAction.type === "suspend" ? "Suspend tenant" : "Unsuspend tenant"}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2">
            To confirm, type{" "}
            <Typography component="span" sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700 }}>
              {tenantAction.phrase}
            </Typography>
            .
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {tenantAction.tenant.company_name}
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={tenantActionInput}
            onChange={(event) => onTenantActionInputChange(event.target.value)}
            placeholder={tenantAction.phrase}
          />
          <TextField
            fullWidth
            size="small"
            multiline
            minRows={2}
            value={tenantActionReason}
            onChange={(event) => onTenantActionReasonChange(event.target.value)}
            placeholder="Optional: document the reason for this action"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button type="button" variant="outlined" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="contained"
          color={tenantAction.type === "suspend" ? "warning" : "success"}
          disabled={busyTenantId === tenantAction.tenant.id || tenantActionInput !== tenantAction.phrase}
          onClick={onConfirm}
        >
          {busyTenantId === tenantAction.tenant.id
            ? tenantAction.type === "suspend"
              ? "Suspending..."
              : "Reactivating..."
            : tenantAction.type === "suspend"
            ? "Confirm suspend"
            : "Confirm unsuspend"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
