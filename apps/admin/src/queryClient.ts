import { ApiError } from '@app/api-client'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/vue-query'

export const ME_KEY = ['me'] as const

const MAX_RETRIES = 2

/** Повторяем только сетевые сбои и 5xx; 4xx — ошибка запроса, повтор не поможет. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false
  if (error instanceof ApiError) return error.status === 0 || error.status >= 500
  return false
}

/** Глобальная обработка 401: очистка кэша и переход на вход (раздел 13.1 ТЗ-1). */
export function createQueryClient(onUnauthorized: () => void): QueryClient {
  const handle = (error: unknown, isMe = false): void => {
    if (error instanceof ApiError && error.status === 401 && !isMe) onUnauthorized()
  }
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => handle(error, query.queryKey[0] === ME_KEY[0]),
    }),
    mutationCache: new MutationCache({ onError: (error) => handle(error) }),
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  })
}
