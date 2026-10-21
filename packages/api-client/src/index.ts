import createClient, { type Middleware } from 'openapi-fetch'

import type { components, paths } from './schema'

export type { components, paths } from './schema'
export type Problem = components['schemas']['Problem']

export interface ApiFieldError {
  field: string
  code: string
}

/** Ошибка API: problem+json (ТЗ-1 §7.3) превращается в типизированное исключение. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly errors: ApiFieldError[]
  /** Секунды из заголовка Retry-After (429). */
  readonly retryAfter: number | undefined
  readonly requestId: string | undefined

  constructor(init: {
    status: number
    code: string
    errors?: ApiFieldError[]
    retryAfter?: number
    requestId?: string
  }) {
    super(`${init.status} ${init.code}`)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.errors = init.errors ?? []
    this.retryAfter = init.retryAfter
    this.requestId = init.requestId
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
/** `__Host-csrf` в prod, `csrf` в dev/test (ТЗ-1 §7.7). */
export const CSRF_COOKIE_NAMES = ['__Host-csrf', 'csrf'] as const

export interface ApiClientOptions {
  baseUrl?: string
  fetch?: typeof fetch
  /** Строка document.cookie; по умолчанию читается из document. */
  getCookies?: () => string
}

export function readCookie(name: string, cookieString: string): string | undefined {
  for (const part of cookieString.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

export function readCsrfToken(cookieString: string): string | undefined {
  for (const name of CSRF_COOKIE_NAMES) {
    const value = readCookie(name, cookieString)
    if (value) return value
  }
  return undefined
}

export function csrfMiddleware(getCookies: () => string): Middleware {
  return {
    onRequest({ request }) {
      if (!SAFE_METHODS.has(request.method)) {
        const token = readCsrfToken(getCookies())
        if (token) request.headers.set('X-CSRF-Token', token)
      }
      return request
    },
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  let body: Partial<Problem> | null = null
  try {
    body = (await response.clone().json()) as Partial<Problem>
  } catch {
    body = null
  }
  const retry = Number(response.headers.get('Retry-After'))
  return new ApiError({
    status: response.status,
    code: body?.code ?? 'internal_error',
    errors: body?.errors ?? [],
    ...(Number.isFinite(retry) && retry > 0 ? { retryAfter: retry } : {}),
    ...(body?.request_id ? { requestId: body.request_id } : {}),
  })
}

export const errorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) throw await toApiError(response)
    return response
  },
}

/** Сетевой сбой (нет соединения, таймаут) → ApiError со статусом 0. */
export function networkSafeFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      return await base(input, init)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError({ status: 0, code: 'network' })
    }
  }
}

/**
 * Типизированный клиент: типы генерируются из OpenAPI бэкенда (`make openapi`).
 * Ответы 4xx/5xx бросают ApiError, к изменяющим запросам добавляется X-CSRF-Token.
 */
export function createApiClient(options: ApiClientOptions = {}) {
  const { baseUrl = '', fetch: customFetch, getCookies } = options
  const base = customFetch ?? ((input, init) => globalThis.fetch(input, init))
  const client = createClient<paths>({
    baseUrl,
    credentials: 'same-origin',
    fetch: networkSafeFetch(base),
  })
  client.use(
    csrfMiddleware(getCookies ?? (() => (typeof document === 'undefined' ? '' : document.cookie))),
  )
  client.use(errorMiddleware)
  return client
}
