import { ApiError } from '@app/api-client'
import { i18n } from '@app/i18n'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import { setMaxBridge, useMaxBridge } from '../src/bridge/useMaxBridge'
import DemoGate from '../src/features/launch/DemoGate.vue'
import {
  errorCode,
  errorMessage,
  isSessionError,
  useBootstrap,
} from '../src/features/launch/useBootstrap'
import { createAppRouter } from '../src/router'
import { BOOTSTRAP, json, mountApp } from './helpers'

afterEach(() => {
  vi.restoreAllMocks()
  setMaxBridge(null)
})

describe('HomePage', () => {
  it('показывает бизнес, вкладки и юридические ссылки', async () => {
    const openLink = vi.fn()
    await mountApp({ app: { openLink } })
    expect(await screen.findByText('Новосибирск, Ленина 1')).toBeTruthy()
    expect(screen.queryByText('Демо')).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: /Мои записи/ }))
    expect(screen.getByRole('tab', { name: /Мои записи/ }).getAttribute('aria-selected')).toBe(
      'true',
    )
    await userEvent.click(screen.getByRole('link', { name: /Политика конфиденциальности/ }))
    expect(openLink).toHaveBeenCalledWith('https://example.ru/privacy')
    expect(screen.queryByRole('link', { name: /Пользовательское соглашение/ })).toBeNull()
    expect(screen.getByText('ООО «Гараж»')).toBeTruthy()
    expect(screen.getByText('Телефон поддержки')).toBeTruthy()
  })

  it('со ссылкой на соглашение она открывается через мост', async () => {
    const openLink = vi.fn()
    await mountApp({
      app: { openLink },
      handlers: {
        'GET /api/v1/max/app/bootstrap': () =>
          json(200, {
            ...BOOTSTRAP,
            legal: { ...BOOTSTRAP.legal, terms_url: 'https://example.ru/terms' },
          }),
      },
    })
    await userEvent.click(await screen.findByRole('link', { name: /Пользовательское соглашение/ }))
    expect(openLink).toHaveBeenCalledWith('https://example.ru/terms')
  })
})

describe('DemoGate', () => {
  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
    })
  }

  it('имя → demo-session → мост подменён, событие ready', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json(200, { init_data: 'signed-demo' }))
    const { emitted } = render(DemoGate, { global: { plugins: [i18n] } })
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(fetchMock).not.toHaveBeenCalled()
    await userEvent.type(screen.getByRole('textbox'), 'Олег')
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    await waitFor(() => expect(emitted().ready).toHaveLength(1))
    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(new URL(request.url).pathname).toBe('/api/v1/max/app/demo-session')
    expect(await request.clone().json()).toEqual({ first_name: 'Олег' })
    expect(useMaxBridge()).toMatchObject({ demo: true, initData: 'signed-demo' })
  })

  it('ошибка демо-сессии показывается сообщением', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(404, { code: 'not_found', status: 404 }))
    render(DemoGate, { global: { plugins: [i18n] } })
    await userEvent.type(screen.getByRole('textbox'), 'Олег')
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(await screen.findByText('Не найдено')).toBeTruthy()
  })
})

describe('router', () => {
  it('память вместо адресной строки: неизвестный путь ведёт на главную, hash не трогается', async () => {
    window.location.hash = '#WebAppData=abc'
    const router = createAppRouter()
    await router.push('/nowhere')
    expect(router.currentRoute.value.name).toBe('home')
    expect(window.location.hash).toBe('#WebAppData=abc')
  })
})

describe('useBootstrap', () => {
  it('вне шлюза запуска — понятная ошибка', () => {
    const Bad = defineComponent({
      setup() {
        useBootstrap()
        return () => null
      },
    })
    expect(() => render(Bad)).toThrow('useBootstrap вне шлюза запуска')
  })

  it('коды ошибок и тексты', () => {
    expect(errorCode(new ApiError({ status: 0, code: 'network' }))).toBe('network')
    expect(errorCode(new ApiError({ status: 409, code: 'slot_taken' }))).toBe('slot_taken')
    expect(errorCode(new Error('x'))).toBe('internal_error')
    expect(errorMessage('slot_taken')).toBe('errors.api.slot_taken')
    expect(errorMessage('странный_код')).toBe('errors.api.internal_error')
    expect(isSessionError(new ApiError({ status: 401, code: 'max_init_data_invalid' }))).toBe(true)
    expect(isSessionError(new ApiError({ status: 500, code: 'x' }))).toBe(false)
  })
})
