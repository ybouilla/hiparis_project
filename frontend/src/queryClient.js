import { QueryClient } from "@tanstack/react-query";

const MINUTE = 60 * 1000;

/**
 * The cache of the API answers, kept in the memory of the browser tab.
 *
 * The movie data never changes while the site is open, so an answer is "fresh" for 5 minutes:
 * asking again for the same page / filters / statistics is answered from the cache, without any
 * request. It is kept for 30 minutes after its last use, then forgotten.
 * Everything is lost when the tab is reloaded (the server-side caches take over then).
 */
export function createQueryClient(overrides = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * MINUTE,
        gcTime: 30 * MINUTE,
        retry: false,                  // a failed request is shown as such, not retried silently
        refetchOnWindowFocus: false,   // the data does not change: no refetch when the tab gets focus
        ...overrides,
      },
    },
  });
}
