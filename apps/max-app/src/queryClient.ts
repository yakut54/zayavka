import { ApiError } from '@app/api-client'
import { QueryClient } from '@tanstack/vue-query'

const MAX_RETRIES = 2

/** Повторяем только сетевые сбои и 5xx; 4xx (в том числе 401 initData) повтор не лечит. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false
  if (error instanceof ApiError) return error.status === 0 || error.status >= 500
  return false
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 60_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  })
}
