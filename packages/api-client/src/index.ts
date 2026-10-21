import createClient, { type Middleware } from 'openapi-fetch'

import type { components, paths } from './schema'

export type { components, paths } from './schema'
export type Problem = components['schemas']['Problem']

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface ApiClientOptions {
  baseUrl?: string
  /** Имя cookie с CSRF-токеном: `csrf` в dev, `__Host-csrf` в prod. */
  csrfCookieName?: string
  fetch?: typeof fetch
}

export function readCookie(name: string, cookieString: string): string | undefined {
  for (const part of cookieString.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

export function csrfMiddleware(cookieName: string, getCookies: () => string): Middleware {
  return {
    onRequest({ request }) {
      if (!SAFE_METHODS.has(request.method)) {
        const token = readCookie(cookieName, getCookies())
        if (token) request.headers.set('X-CSRF-Token', token)
      }
      return request
    },
  }
}

/** Типизированный клиент: типы генерируются из OpenAPI бэкенда (`make openapi`). */
export function createApiClient(options: ApiClientOptions = {}) {
  const { baseUrl = '', csrfCookieName = 'csrf', fetch: customFetch } = options
  const client = createClient<paths>({
    baseUrl,
    credentials: 'same-origin',
    ...(customFetch ? { fetch: customFetch } : {}),
  })
  client.use(
    csrfMiddleware(csrfCookieName, () => (typeof document === 'undefined' ? '' : document.cookie)),
  )
  return client
}
