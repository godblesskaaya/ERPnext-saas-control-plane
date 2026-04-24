import { QueryCache, QueryClient } from "@tanstack/react-query";

import { isSessionExpiredError } from "../lib/api";

function handleQueryError(error: unknown) {
  if (typeof window === "undefined" || !isSessionExpiredError(error)) return;
  window.location.assign("/login?reason=session-expired");
}

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: handleQueryError,
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
