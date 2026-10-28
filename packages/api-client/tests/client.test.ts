import { describe, expect, it, vi } from 'vitest'

import { ApiError, createApiClient, readCookie, readCsrfToken, toApiError } from '../src'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

describe('cookie', () => {
  it('readCookie находит значение и декодирует его', () => {
    expect(readCookie('a', 'x=1; a=%D0%BF; b=2')).toBe('п')
    expect(readCookie('zzz', 'x=1')).toBeUndefined()
  })

  it('CSRF: __Host-csrf приоритетнее csrf', () => {
    expect(readCsrfToken('csrf=dev; __Host-csrf=prod')).toBe('prod')
    expect(readCsrfToken('csrf=dev')).toBe('dev')
    expect(readCsrfToken('other=1')).toBeUndefined()
  })
})

describe('toApiError', () => {
  it('разбирает problem+json', async () => {
    const error = await toApiError(
      json(422, {
        code: 'validation_error',
        errors: [{ field: 'phone', code: 'phone_invalid' }],
        request_id: 'r1',
      }),
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_error',
      errors: [{ field: 'phone', code: 'phone_invalid' }],
      requestId: 'r1',
      retryAfter: undefined,
    })
  })

  it('дополнительные поля тела доступны в body (список конфликтующих записей)', async () => {
    const error = await toApiError(
      json(409, { code: 'conflicts_with_bookings', bookings: [{ public_number: 5 }] }),
    )
    expect(error.body.bookings).toEqual([{ public_number: 5 }])
    const plain = await toApiError(new Response('boom', { status: 502 }))
    expect(plain.body).toEqual({})
  })

  it('Retry-After попадает в retryAfter', async () => {
    const error = await toApiError(json(429, { code: 'rate_limited' }, { 'Retry-After': '90' }))
    expect(error.retryAfter).toBe(90)
  })

  it('тело не JSON → internal_error', async () => {
    const error = await toApiError(new Response('boom', { status: 502 }))
    expect(error).toMatchObject({ status: 502, code: 'internal_error', errors: [] })
  })
})

describe('createApiClient', () => {
  it('изменяющие запросы получают X-CSRF-Token, GET — нет', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
      getCookies: () => 'csrf=tok',
    })
    await client.GET('/api/v1/admin/auth/me').catch(() => undefined)
    await client.POST('/api/v1/admin/auth/logout').catch(() => undefined)
    const [get, post] = fetchMock.mock.calls.map((c) => (c as unknown as [Request])[0])
    expect(get?.headers.get('X-CSRF-Token')).toBeNull()
    expect(post?.headers.get('X-CSRF-Token')).toBe('tok')
  })

  it('4xx превращается в ApiError', async () => {
    const fetchMock = vi.fn(async () => json(401, { code: 'unauthenticated' }))
    const client = createApiClient({
      baseUrl: 'http://api.test',
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    })
    await expect(client.GET('/api/v1/admin/auth/me')).rejects.toMatchObject({
      status: 401,
      code: 'unauthenticated',
    })
  })

  it('сетевой сбой — ApiError со статусом 0 и кодом network', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('failed to fetch')
    })
    const client = createApiClient({
      baseUrl: 'http://api.test',
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    })
    await expect(client.GET('/api/v1/admin/auth/me')).rejects.toMatchObject({
      status: 0,
      code: 'network',
    })
  })

  it('успешный ответ возвращает данные', async () => {
    const fetchMock = vi.fn(async () => json(200, { id: '1', email: 'a@b.ru' }))
    const client = createApiClient({
      baseUrl: 'http://api.test',
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    })
    const { data } = await client.GET('/api/v1/admin/auth/me')
    expect(data).toEqual({ id: '1', email: 'a@b.ru' })
  })

  it('без document и getCookies CSRF-заголовок не добавляется', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    const client = createApiClient({
      baseUrl: 'http://api.test',
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    })
    await client.POST('/api/v1/admin/auth/logout').catch(() => undefined)
    const request = (fetchMock.mock.calls[0] as unknown as [Request])[0]
    expect(request.headers.get('X-CSRF-Token')).toBeNull()
  })
})
