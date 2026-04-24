"use client";

import { useEffect } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";

export default function TenantError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Stack p={4} spacing={2} maxWidth={500} mx="auto">
      <Alert severity="error">
        <Typography variant="subtitle2">This tenant page crashed</Typography>
        <Typography variant="body2">Retry this tab. Other tenant pages are unaffected.</Typography>
      </Alert>
      <Button variant="outlined" onClick={reset}>Retry</Button>
    </Stack>
  );
}
