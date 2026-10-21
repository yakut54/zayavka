import { ApiError, type components, createApiClient } from '@app/api-client'

export type LeadCreate = components['schemas']['LeadCreate']

export interface FieldError {
  field: string
  code: string
}

export type SubmitResult =
  | { kind: 'ok'; number: number }
  | { kind: 'validation'; errors: FieldError[] }
  | { kind: 'rate-limited'; retryAfterSeconds: number }
  | { kind: 'server-error' }
  | { kind: 'network' }

export const REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_RETRY_AFTER_S = 60

const client = createApiClient()

function toResult(error: unknown): SubmitResult {
  if (!(error instanceof ApiError)) return { kind: 'network' }
  if (error.status === 0) return { kind: 'network' }
  if (error.status === 429) {
    return { kind: 'rate-limited', retryAfterSeconds: error.retryAfter ?? DEFAULT_RETRY_AFTER_S }
  }
  if (error.status === 422 && error.errors.length > 0) {
    return { kind: 'validation', errors: error.errors }
  }
  return { kind: 'server-error' }
}

/** Отправка заявки; сетевые сбои и таймаут (15 с) превращаются в `network`. */
export async function submitLead(
  body: LeadCreate,
  options: { fetch?: typeof fetch } = {},
): Promise<SubmitResult> {
  const api = options.fetch ? createApiClient({ fetch: options.fetch }) : client
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const { data } = await api.POST('/api/v1/public/leads', { body, signal: controller.signal })
    return data ? { kind: 'ok', number: data.public_number } : { kind: 'server-error' }
  } catch (error) {
    return toResult(error)
  } finally {
    clearTimeout(timer)
  }
}
