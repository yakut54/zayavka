import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ApiError } from '@app/api-client'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { adminConfig } from '../admin.config'
import { safeNext } from '../src/features/auth/safeNext'
import { isLeadStatus } from '../src/features/leads/statuses'
import { filterQuery } from '../src/features/leads/queries'
import { parseFilters, toQuery } from '../src/features/leads/useLeadFilters'
import { displayPhone, formatDateTime } from '../src/format'
import { createQueryClient, shouldRetry } from '../src/queryClient'
import { useUiStore } from '../src/stores/ui'

describe('safeNext (защита от открытого редиректа)', () => {
  it.each([
    ['/leads', '/leads'],
    ['/leads?status=new&page=2', '/leads?status=new&page=2'],
    ['/account', '/account'],
    ['/leads/0192f5c4-0000-7000-8000-000000000001', '/leads/0192f5c4-0000-7000-8000-000000000001'],
  ])('%j → %j', (value, expected) => {
    expect(safeNext(value)).toBe(expected)
  })

  it.each([
    'https://evil.example/steal',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '/javascript:alert(1)',
    '//javascript:alert(1)',
    'leads',
    '',
    '/login',
    '/login?next=/leads',
    null,
    undefined,
    42,
    ['/leads'],
  ])('отвергает %j', (value) => {
    expect(safeNext(value)).toBe('/leads')
  })
})

describe('фильтры списка в URL', () => {
  it('разбор корректных параметров', () => {
    expect(
      parseFilters({
        q: 'иван',
        status: 'new',
        date_from: '2026-10-01',
        date_to: '2026-10-20',
        page: '3',
        sort: 'created_at',
      }),
    ).toEqual({
      q: 'иван',
      status: 'new',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-20',
      page: 3,
      sort: 'created_at',
    })
  })

  it('мусор отбрасывается, значения по умолчанию', () => {
    expect(
      parseFilters({
        status: 'bogus',
        date_from: 'вчера',
        date_to: '2026-1-1',
        page: '-4',
        sort: 'name',
      }),
    ).toEqual({ q: '', status: '', dateFrom: '', dateTo: '', page: 1, sort: '-created_at' })
    expect(parseFilters({ page: 'abc' }).page).toBe(1)
    expect(parseFilters({ page: '999999999' }).page).toBe(100_000)
    expect(parseFilters({})).toMatchObject({ page: 1, sort: '-created_at' })
  })

  it('массив значений — берётся первое; q обрезается до 100 символов', () => {
    expect(parseFilters({ status: ['done', 'new'] }).status).toBe('done')
    expect(parseFilters({ q: 'я'.repeat(300) }).q).toHaveLength(100)
  })

  it('toQuery не пишет значения по умолчанию в адрес', () => {
    expect(toQuery(parseFilters({}))).toEqual({})
    expect(toQuery(parseFilters({ status: 'new', page: '2', sort: 'created_at', q: 'x' }))).toEqual(
      {
        q: 'x',
        status: 'new',
        page: '2',
        sort: 'created_at',
      },
    )
  })

  it('filterQuery для API (экспорт без страницы и сортировки)', () => {
    expect(filterQuery(parseFilters({ status: 'done', date_from: '2026-10-01', q: 'a' }))).toEqual({
      status: 'done',
      q: 'a',
      date_from: '2026-10-01',
    })
    expect(filterQuery(parseFilters({}))).toEqual({})
  })

  it('isLeadStatus', () => {
    expect(isLeadStatus('spam')).toBe(true)
    expect(isLeadStatus('nope')).toBe(false)
    expect(isLeadStatus(1)).toBe(false)
  })
})

describe('форматирование', () => {
  it('дата в часовом поясе бизнеса: 20.10.2026, 15:15', () => {
    // 08:15 UTC = 15:15 в Asia/Novosibirsk (UTC+7)
    expect(formatDateTime('2026-10-20T08:15:00Z')).toBe('20.10.2026, 15:15')
  })

  it('граница суток: 17:30 UTC — уже следующий день в Новосибирске', () => {
    expect(formatDateTime('2026-03-09T17:30:00Z')).toBe('10.03.2026, 00:30')
  })

  it('российские номера — с маской, иностранные — как есть', () => {
    expect(displayPhone('+79991234567')).toBe('+7 (999) 123-45-67')
    expect(displayPhone('+442079460958')).toBe('+442079460958')
  })
})

describe('queryClient', () => {
  it('повторы только для сети и 5xx', () => {
    expect(shouldRetry(0, new ApiError({ status: 0, code: 'network' }))).toBe(true)
    expect(shouldRetry(0, new ApiError({ status: 503, code: 'internal_error' }))).toBe(true)
    expect(shouldRetry(0, new ApiError({ status: 404, code: 'not_found' }))).toBe(false)
    expect(shouldRetry(0, new ApiError({ status: 401, code: 'unauthenticated' }))).toBe(false)
    expect(shouldRetry(2, new ApiError({ status: 503, code: 'internal_error' }))).toBe(false)
    expect(shouldRetry(0, new Error('boom'))).toBe(false)
  })

  it('401 в запросе и мутации вызывает обработчик, кроме запроса /me', async () => {
    const onUnauthorized = vi.fn()
    const client = createQueryClient(onUnauthorized)
    const unauthorized = new ApiError({ status: 401, code: 'unauthenticated' })

    await client
      .fetchQuery({ queryKey: ['me'], queryFn: () => Promise.reject(unauthorized), retry: false })
      .catch(() => undefined)
    expect(onUnauthorized).not.toHaveBeenCalled()

    await client
      .fetchQuery({
        queryKey: ['leads'],
        queryFn: () => Promise.reject(unauthorized),
        retry: false,
      })
      .catch(() => undefined)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(unauthorized) })
      .execute(undefined)
      .catch(() => undefined)
    expect(onUnauthorized).toHaveBeenCalledTimes(2)
  })

  it('другие ошибки обработчик не вызывают', async () => {
    const onUnauthorized = vi.fn()
    const client = createQueryClient(onUnauthorized)
    await client
      .fetchQuery({
        queryKey: ['x'],
        queryFn: () => Promise.reject(new ApiError({ status: 500, code: 'internal_error' })),
        retry: false,
      })
      .catch(() => undefined)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('тема', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  it('по умолчанию — prefers-color-scheme', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const store = useUiStore()
    store.init()
    expect(store.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    vi.unstubAllGlobals()
  })

  it('выбор запоминается и подхватывается при старте', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const store = useUiStore()
    store.init()
    expect(store.theme).toBe('light')
    store.toggle()
    expect(store.theme).toBe('dark')
    expect(window.localStorage.getItem('admin-theme')).toBe('dark')

    setActivePinia(createPinia())
    const fresh = useUiStore()
    fresh.init()
    expect(fresh.theme).toBe('dark')
    vi.unstubAllGlobals()
  })

  it('недоступный localStorage не ломает переключение', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const store = useUiStore()
    expect(() => store.init()).not.toThrow()
    expect(() => store.toggle()).not.toThrow()
    expect(store.theme).toBe('dark')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('мусор в хранилище игнорируется', () => {
    window.localStorage.setItem('admin-theme', 'purple')
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const store = useUiStore()
    store.init()
    expect(store.theme).toBe('light')
    vi.unstubAllGlobals()
  })
})

describe('соответствие бэкенду', () => {
  it('услуги админки совпадают с services.json (его читает API)', () => {
    const root = join(import.meta.dirname, '../../..')
    const services = JSON.parse(readFileSync(join(root, 'apps/api/services.json'), 'utf8'))
    expect(Object.keys(adminConfig.services).sort()).toEqual([...services.slugs].sort())
  })
})
