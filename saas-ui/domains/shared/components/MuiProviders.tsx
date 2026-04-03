"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0d6a6a",
    },
    secondary: {
      main: "#f59e0b",
    },
    background: {
      default: "#f8f5ef",
      paper: "#ffffff",
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  },
});

export function MuiProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          <CssBaseline />
          {children}
        </QueryClientProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
