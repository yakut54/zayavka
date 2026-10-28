import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { render } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'

import App from '../src/App.vue'
import { createRealBridge } from '../src/bridge/realBridge'
import { setMaxBridge } from '../src/bridge/useMaxBridge'
import type { WebAppApi } from '../src/bridge/webapp'
import { createAppRouter } from '../src/router'

export const SERVICE_A = {
  slug: 'diagnostics',
  title: 'Диагностика',
  price_from: 1500,
  duration_min: 60,
}
export const SERVICE_B = { slug: 'tires', title: 'Шиномонтаж', price_from: null, duration_min: 45 }
export const RES_1 = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Иван',
  title: 'Мастер',
  service_slugs: ['diagnostics', 'tires'],
}
export const RES_2 = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Пётр',
  title: null,
  service_slugs: ['diagnostics'],
}

export const BOOTSTRAP = {
  user: { first_name: 'Анна' },
  business: {
    name: 'Гараж',
    phone: '+73830000000',
    address: 'Новосибирск, Ленина 1',
    working_hours: '',
    timezone: 'Asia/Novosibirsk',
  },
  services: [SERVICE_A, SERVICE_B],
  resources: [RES_1, RES_2],
  settings: { cancel_deadline_min: 120, horizon_days: 30 },
  legal: {
    policy_version: '2026-01',
    privacy_url: 'https://example.ru/privacy',
    consent_url: 'https://example.ru/consent',
    terms_url: null,
    operator: 'ООО «Гараж»',
    support: 'Телефон поддержки',
  },
}

export function bookingView(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    public_number: 7,
    status: 'confirmed',
    service: { slug: 'diagnostics', title: 'Диагностика' },
    resource: { id: RES_1.id, name: 'Иван', title: 'Мастер' },
    starts_at: '2030-05-20T03:00:00Z',
    ends_at: '2030-05-20T04:00:00Z',
    can_change: true,
    change_deadline: '2030-05-20T01:00:00Z',
    version: 1,
    ...overrides,
  }
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json',
      ...headers,
    },
  })
}

export function problem(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
  headers = {},
) {
  return json(status, { code, status, title: code, ...extra }, headers)
}

export type Handler = (request: Request) => Response | Promise<Response>
export type Handlers = Record<string, Handler>

export interface Call {
  key: string
  request: Request
}

/** Ответы по ключу `METHOD /путь`; запросы без обработчика падают тестом. */
export function mockApi(handlers: Handlers) {
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const request = input as Request
    const key = `${request.method} ${new URL(request.url).pathname}`
    calls.push({ key, request: request.clone() })
    const handler = handlers[key]
    if (!handler) throw new Error(`нет обработчика для ${key}`)
    return handler(request)
  })
  return {
    calls,
    of: (key: string) => calls.filter((call) => call.key === key),
  }
}

const P = '/api/v1/max/app'

export function defaultHandlers(): Handlers {
  return {
    [`GET ${P}/bootstrap`]: () => json(200, BOOTSTRAP),
    [`GET ${P}/bookings`]: () => json(200, { items: [], page: 1, total: 0 }),
    [`GET ${P}/availability/days`]: (request) => {
      const url = new URL(request.url)
      const from = url.searchParams.get('from') as string
      const to = url.searchParams.get('to') as string
      const out: { date: string; available: boolean }[] = []
      for (
        let at = Date.parse(`${from}T00:00:00Z`);
        at <= Date.parse(`${to}T00:00:00Z`);
        at += 86_400_000
      ) {
        out.push({ date: new Date(at).toISOString().slice(0, 10), available: out.length > 0 })
      }
      return json(200, out)
    },
    [`GET ${P}/availability/slots`]: (request) =>
      json(200, {
        date: new URL(request.url).searchParams.get('date'),
        slots: [
          { starts_at: '2030-05-20T03:00:00Z', ends_at: '2030-05-20T04:00:00Z' },
          { starts_at: '2030-05-20T08:00:00Z', ends_at: '2030-05-20T09:00:00Z' },
          { starts_at: '2030-05-20T12:00:00Z', ends_at: '2030-05-20T13:00:00Z' },
        ],
      }),
  }
}

export interface MountOptions {
  app?: Partial<WebAppApi>
  handlers?: Handlers
  path?: string
}

export async function mountApp(options: MountOptions = {}) {
  setMaxBridge(
    createRealBridge({
      initData: 'signed',
      platform: 'ios',
      initDataUnsafe: { user: { first_name: 'Анна' } },
      ...options.app,
    }),
  )
  const api = mockApi({ ...defaultHandlers(), ...options.handlers })
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createAppRouter()
  await router.push(options.path ?? '/')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  return { ...view, api, router, queryClient }
}
