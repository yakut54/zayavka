import { type components, createApiClient } from '@app/api-client'

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

const client = createApiClient()

/** Отправка заявки; сетевые сбои и таймаут (15 с) превращаются в `network`. */
export async function submitLead(
  body: LeadCreate,
  options: { fetch?: typeof fetch } = {},
): Promise<SubmitResult> {
  const api = options.fetch ? createApiClient({ fetch: options.fetch }) : client
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const { data, error, response } = await api.POST('/api/v1/public/leads', {
      body,
      signal: controller.signal,
    })
    if (data) return { kind: 'ok', number: data.public_number }
    if (response.status === 429) {
      const retry = Number(response.headers.get('Retry-After'))
      return {
        kind: 'rate-limited',
        retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : 60,
      }
    }
    const problem = error as { errors?: FieldError[] | null } | undefined
    if (response.status === 422 && problem?.errors) {
      return { kind: 'validation', errors: problem.errors }
    }
    return { kind: 'server-error' }
  } catch {
    return { kind: 'network' }
  } finally {
    clearTimeout(timer)
  }
}
