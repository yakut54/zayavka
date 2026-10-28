import { createApiClient } from '@app/api-client'

import { maxConfig } from '../max.config'
import { useMaxBridge } from './bridge/useMaxBridge'

/** Сетевой таймаут запроса (раздел 10.4 ТЗ): по истечении — ApiError со статусом 0. */
export function withTimeout(base: typeof fetch, ms: number): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms)
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    return base(input, { ...init, signal })
  }
}

export const api = createApiClient({
  fetch: withTimeout((input, init) => globalThis.fetch(input, init), maxConfig.requestTimeoutMs),
})

api.use({
  onRequest({ request }) {
    const initData = useMaxBridge().initData
    if (initData) request.headers.set('X-Max-Init-Data', initData)
    return request
  },
})
