import { ApiError } from '@app/api-client'
import { i18n } from '@app/i18n'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { withTimeout } from '../src/api'
import { createDemoBridge } from '../src/bridge/demoBridge'
import { createRealBridge } from '../src/bridge/realBridge'
import { setMaxBridge } from '../src/bridge/useMaxBridge'
import LaunchGate from '../src/features/launch/LaunchGate.vue'
import { useBootstrap } from '../src/features/launch/useBootstrap'
import { shouldRetry } from '../src/queryClient'

const BOOTSTRAP = {
  user: { first_name: 'Анна' },
  business: {
    name: 'Гараж',
    phone: '+7',
    address: 'Новосибирск',
    working_hours: '',
    timezone: 'Asia/Novosibirsk',
  },
  services: [],
  resources: [],
  settings: { cancel_deadline_min: 120, horizon_days: 30 },
  legal: {
    policy_version: '1',
    privacy_url: 'https://x/privacy',
    consent_url: 'https://x/c',
    terms_url: null,
    operator: 'ООО',
    support: 'тел',
  },
}

const Probe = defineComponent({
  setup() {
    const data = useBootstrap()
    return () => h('p', data.value.business.address)
  },
})

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(LaunchGate, {
    slots: { default: () => h(Probe) },
    global: { plugins: [i18n, [VueQueryPlugin, { queryClient }]] },
  })
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

beforeEach(() => setMaxBridge(null))
afterEach(() => {
  vi.restoreAllMocks()
  setMaxBridge(null)
})

describe('LaunchGate', () => {
  it('вне MAX без демо — «Откройте приложение в MAX» и кнопка бота', async () => {
    mount()
    expect(await screen.findByText('Откройте приложение в MAX')).toBeTruthy()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await userEvent.click(screen.getByRole('button', { name: 'Открыть бота в MAX' }))
    expect(open).toHaveBeenCalled()
  })

  it('успех: данные доступны экранам, initData уходит заголовком', async () => {
    setMaxBridge(createRealBridge({ initData: 'signed' }))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, BOOTSTRAP))
    mount()
    expect(await screen.findByText('Новосибирск')).toBeTruthy()
    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.headers.get('X-Max-Init-Data')).toBe('signed')
    expect(new URL(request.url).pathname).toBe('/api/v1/max/app/bootstrap')
  })

  it('401 max_init_data_expired — «Сессия устарела» без повторов', async () => {
    setMaxBridge(createDemoBridge('old', 'Анна'))
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json(401, { code: 'max_init_data_expired', status: 401 }))
    mount()
    expect(await screen.findByText('Сессия устарела')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('сетевая ошибка — ErrorState с повтором', async () => {
    setMaxBridge(createDemoBridge('x', 'Анна'))
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(json(200, BOOTSTRAP))
    mount()
    expect(await screen.findByText('Нет соединения с сервером')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.getByText('Новосибирск')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('сеть', () => {
  it('shouldRetry: только сеть и 5xx, не больше двух раз', () => {
    expect(shouldRetry(0, new ApiError({ status: 0, code: 'network' }))).toBe(true)
    expect(shouldRetry(0, new ApiError({ status: 503, code: 'x' }))).toBe(true)
    expect(shouldRetry(0, new ApiError({ status: 401, code: 'x' }))).toBe(false)
    expect(shouldRetry(2, new ApiError({ status: 503, code: 'x' }))).toBe(false)
    expect(shouldRetry(0, new Error('x'))).toBe(false)
  })

  it('withTimeout прерывает запрос и учитывает собственный signal', async () => {
    const seen: AbortSignal[] = []
    const base = ((_: unknown, init?: RequestInit) => {
      seen.push(init!.signal!)
      return new Promise<Response>((_, reject) =>
        init!.signal!.addEventListener('abort', () => reject(new DOMException('t', 'AbortError'))),
      )
    }) as typeof fetch
    const guarded = withTimeout(base, 10)
    await expect(guarded('/x')).rejects.toThrow()
    const own = new AbortController()
    const pending = guarded('/y', { signal: own.signal })
    own.abort()
    await expect(pending).rejects.toThrow()
    expect(seen).toHaveLength(2)
  })
})
