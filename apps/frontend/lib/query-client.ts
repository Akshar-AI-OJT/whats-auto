import { QueryClient } from '@tanstack/react-query'

function isAuthStatusError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const status = (error as { status?: unknown }).status
  return status === 401 || status === 403
}

/** Per-tree QueryClient factory — avoid a module singleton (SSR leak risk). */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // api.ts already remints+retries once on token 401s — don't stack Query retries.
        retry: (failureCount, error) => {
          if (isAuthStatusError(error)) return false
          return failureCount < 2
        },
      },
    },
  })
}
