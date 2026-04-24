"use client";

import type { ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  type ButtonProps,
} from "@mui/material";

type ConfirmActionDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  confirmColor?: ButtonProps["color"];
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

export function ConfirmActionDialog({
  open,
  title,
  body,
  confirmLabel,
  confirmColor = "primary",
  busy = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmActionDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{body}</DialogContentText>
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={busy}
          color={confirmColor}
          variant="contained"
        >
          {busy ? "Working..." : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
