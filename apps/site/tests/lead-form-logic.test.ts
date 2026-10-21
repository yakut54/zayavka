import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { REQUEST_TIMEOUT_MS, submitLead } from '../src/features/lead-form/api'
import { leadInitial, leadSchema } from '../src/features/lead-form/schema'
import { buildPayload, readUtm } from '../src/features/lead-form/useLeadForm'

const valid = {
  name: 'Иван',
  phone: '79991234567',
  email: '',
  serviceSlug: '',
  message: '',
  consent: true,
}

function issues(values: Record<string, unknown>): Record<string, string> {
  const parsed = leadSchema.safeParse({ ...valid, ...values })
  if (parsed.success) return {}
  const result: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0])
    if (!(key in result)) result[key] = issue.message
  }
  return result
}

describe('leadSchema', () => {
  it('валидные значения проходят', () => {
    expect(issues({})).toEqual({})
  })

  it('согласие по умолчанию не отмечено', () => {
    expect(leadInitial.consent).toBe(false)
    expect(issues({ consent: false })).toEqual({ consent: 'consent_required' })
  })

  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['И', 'too_short'],
    ['И'.repeat(101), 'too_long'],
  ])('имя %j → %s', (name, code) => {
    expect(issues({ name }).name).toBe(code)
  })

  it.each([
    ['', 'required'],
    ['7999', 'phone_invalid'],
    ['89991234567', 'phone_invalid'],
    ['799912345678', 'phone_invalid'],
  ])('телефон %j → %s', (phone, code) => {
    expect(issues({ phone }).phone).toBe(code)
  })

  it.each([
    ['', undefined],
    ['a@b.ru', undefined],
    ['  a@b.ru  ', undefined],
    ['не email', 'email_invalid'],
    ['a@b', 'email_invalid'],
    [`${'a'.repeat(250)}@b.ru`, 'too_long'],
  ])('email %j → %s', (email, code) => {
    expect(issues({ email }).email).toBe(code)
  })

  it('сообщение до 2000 символов', () => {
    expect(issues({ message: 'я'.repeat(2000) })).toEqual({})
    expect(issues({ message: 'я'.repeat(2001) }).message).toBe('too_long')
  })
})

describe('readUtm', () => {
  it('берёт только известные метки', () => {
    expect(readUtm('?utm_source=yandex&utm_medium=cpc&foo=bar&utm_term=a')).toEqual({
      utm_source: 'yandex',
      utm_medium: 'cpc',
      utm_term: 'a',
    })
  })

  it('пустые и отсутствующие — пропускает', () => {
    expect(readUtm('?utm_source=')).toEqual({})
    expect(readUtm('')).toEqual({})
  })

  it('обрезает длинные значения до 200 символов', () => {
    expect(readUtm(`?utm_campaign=${'x'.repeat(500)}`)?.utm_campaign).toHaveLength(200)
  })
})

describe('buildPayload', () => {
  it('нормализует значения под API', () => {
    const payload = buildPayload(
      {
        name: '  Иван ',
        phone: '79991234567',
        email: ' a@b.ru ',
        serviceSlug: 'tires',
        message: ' привет ',
      },
      { website: '', elapsedMs: 4321.6, utm: { utm_source: 'x' } },
    )
    expect(payload).toEqual({
      name: 'Иван',
      phone: '+79991234567',
      email: 'a@b.ru',
      message: 'привет',
      service_slug: 'tires',
      consent: true,
      policy_version: '2026-10-20',
      utm: { utm_source: 'x' },
      website: '',
      elapsed_ms: 4322,
    })
  })

  it('пустые необязательные поля уходят как null', () => {
    const payload = buildPayload(
      { name: 'Иван', phone: '79991234567', email: '', serviceSlug: '', message: '  ' },
      { website: 'spam', elapsedMs: -5, utm: {} },
    )
    expect(payload.email).toBeNull()
    expect(payload.message).toBeNull()
    expect(payload.service_slug).toBeNull()
    expect(payload.website).toBe('spam')
    expect(payload.elapsed_ms).toBe(0)
  })
})

describe('submitLead', () => {
  const body = buildPayload(
    { name: 'Иван', phone: '79991234567', email: '', serviceSlug: '', message: '' },
    { website: '', elapsedMs: 5000, utm: {} },
  )

  const respond = (status: number, json: unknown, headers: Record<string, string> = {}) =>
    vi.fn(
      async () =>
        new Response(JSON.stringify(json), {
          status,
          headers: { 'Content-Type': 'application/json', ...headers },
        }),
    )

  it('201 → номер заявки; тело отправляется как JSON', async () => {
    const fetchMock = respond(201, { public_number: 123 }) as unknown as ReturnType<typeof vi.fn>
    expect(await submitLead(body, { fetch: fetchMock as unknown as typeof fetch })).toEqual({
      kind: 'ok',
      number: 123,
    })
    const request = fetchMock.mock.calls[0]?.[0] as unknown as Request
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/api/v1/public/leads')
    expect(await request.json()).toMatchObject({ phone: '+79991234567', consent: true })
  })

  it('422 → ошибки полей', async () => {
    const errors = [{ field: 'phone', code: 'phone_invalid' }]
    const fetchMock = respond(422, { code: 'validation_error', errors })
    expect(await submitLead(body, { fetch: fetchMock })).toEqual({ kind: 'validation', errors })
  })

  it('429 → пауза из Retry-After', async () => {
    const fetchMock = respond(429, { code: 'rate_limited' }, { 'Retry-After': '240' })
    expect(await submitLead(body, { fetch: fetchMock })).toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 240,
    })
  })

  it('429 без заголовка → минута по умолчанию', async () => {
    const fetchMock = respond(429, { code: 'rate_limited' })
    expect(await submitLead(body, { fetch: fetchMock })).toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 60,
    })
  })

  it('500 → server-error', async () => {
    expect(await submitLead(body, { fetch: respond(500, { code: 'internal_error' }) })).toEqual({
      kind: 'server-error',
    })
  })

  it('422 без списка ошибок → server-error', async () => {
    expect(await submitLead(body, { fetch: respond(422, { code: 'validation_error' }) })).toEqual({
      kind: 'server-error',
    })
  })

  it('сетевой сбой → network', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('failed to fetch')
    })
    expect(await submitLead(body, { fetch: fetchMock })).toEqual({ kind: 'network' })
  })

  describe('таймаут', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('через 15 секунд запрос прерывается → network', async () => {
      const fetchMock = vi.fn(
        (input: Request) =>
          new Promise<Response>((_resolve, reject) => {
            input.signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      )
      const promise = submitLead(body, { fetch: fetchMock as unknown as typeof fetch })
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
      expect(await promise).toEqual({ kind: 'network' })
    })
  })
})
