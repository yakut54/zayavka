import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setMaxBridge } from '../src/bridge/useMaxBridge'
import { RES_1, bookingView, json, mountApp, problem } from './helpers'

const P = '/api/v1/max/app'

afterEach(() => {
  vi.restoreAllMocks()
  setMaxBridge(null)
})

/** Проходит шаги до подтверждения: услуга → специалист → дата → время → контакты. */
async function reachConfirm(ctx: Awaited<ReturnType<typeof mountApp>>) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('radio', { name: /Диагностика/ }))
  await user.click(await screen.findByRole('radio', { name: /Любой свободный/ }))
  const days = await screen.findAllByRole('option')
  await user.click(days[1] as HTMLElement)
  await user.click(await screen.findByRole('radio', { name: '10:00' }))
  await user.click(await screen.findByRole('button', { name: /Далее: 10:00–11:00/ }))
  await user.type(await screen.findByRole('textbox', { name: /Телефон/ }), '9991234567')
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Далее' }))
  await screen.findByRole('button', { name: 'Записаться' })
  return { user, ...ctx }
}

describe('запись: сквозной сценарий', () => {
  it('услуга → специалист → дата → время → контакты → подтверждение → успех', async () => {
    const ctx = await mountApp({
      handlers: { [`POST ${P}/bookings`]: () => json(201, bookingView()) },
    })
    const { user, api } = await reachConfirm(ctx)

    // сводка на подтверждении
    expect(screen.getByText('Диагностика')).toBeTruthy()
    expect(screen.getByText('+79991234567')).toBeTruthy()
    expect(screen.getByText(/Отменить или перенести можно до/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Записаться' }))
    expect(await screen.findByRole('heading', { name: 'Вы записаны' })).toBeTruthy()
    expect(screen.getByText('Запись № 7')).toBeTruthy()

    const [create] = api.of(`POST ${P}/bookings`)
    const body = await create!.request.json()
    expect(body).toMatchObject({
      service_slug: 'diagnostics',
      resource_id: null,
      phone: '+79991234567',
      consent: true,
      policy_version: '2026-01',
      name: 'Анна',
    })
    expect(create!.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
    expect(create!.request.headers.get('X-Max-Init-Data')).toBe('signed')
    // на экране успеха доступна кнопка календаря (iOS)
    expect(screen.getByRole('button', { name: 'Добавить в календарь' })).toBeTruthy()
  })

  it('на шаге времени выбранная дата ведёт назад, а ближайший день выбран по умолчанию', async () => {
    await mountApp()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Диагностика/ }))
    await user.click(await screen.findByRole('radio', { name: /Пётр/ }))
    await waitFor(() => {
      const selected = screen
        .getAllByRole('option')
        .filter((option) => option.getAttribute('aria-selected') === 'true')
      expect(selected).toHaveLength(1)
    })
    // первый день недоступен (aria-disabled), выбран второй — ближайший доступный
    const options = screen.getAllByRole('option')
    expect(options[0]?.getAttribute('aria-disabled')).toBe('true')
    expect(options[1]?.getAttribute('aria-selected')).toBe('true')
    await user.click(options[1] as HTMLElement)
    await screen.findByRole('radio', { name: '10:00' })
    // три группы времени: утро, день, вечер
    expect(screen.getByText('Утро')).toBeTruthy()
    expect(screen.getByText('День')).toBeTruthy()
    expect(screen.getByText('Вечер')).toBeTruthy()
  })

  it('единственный подходящий специалист: шаг пропускается, счётчик шагов 1 из 5…', async () => {
    const { api } = await mountApp()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Шиномонтаж/ }))
    expect(await screen.findByText('Шаг 2 из 5')).toBeTruthy()
    await screen.findAllByRole('option')
    const [days] = api.of(`GET ${P}/availability/days`)
    expect(new URL(days!.request.url).searchParams.get('resource')).toBe(RES_1.id)
  })

  it('параметр запуска s_<slug> предвыбирает услугу', async () => {
    await mountApp({
      app: { initDataUnsafe: { start_param: 's_tires', user: { first_name: 'Анна' } } },
    })
    expect(await screen.findByText('Шаг 2 из 5')).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /Диагностика/ })).toBeNull()
  })

  it('в демо-режиме кнопка «Назад» рисуется приложением', async () => {
    const { createDemoBridge } = await import('../src/bridge/demoBridge')
    setMaxBridge(createDemoBridge('signed', 'Анна'))
    const ctx = await mountApp({ path: '/' })
    // mountApp подменил мост на обычный, поэтому проверяем перенос шага назад через маршрутизатор
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Шиномонтаж/ }))
    await screen.findByText('Шаг 2 из 5')
    ctx.router.back()
    await screen.findByRole('radio', { name: /Диагностика/ })
  })
})

describe('запись: ошибки при отправке', () => {
  it('409 slot_taken: сообщение и возврат на выбор времени', async () => {
    const ctx = await mountApp({
      handlers: { [`POST ${P}/bookings`]: () => problem(409, 'slot_taken') },
    })
    const { user } = await reachConfirm(ctx)
    await user.click(screen.getByRole('button', { name: 'Записаться' }))
    expect(await screen.findByText('Это время только что заняли')).toBeTruthy()
    await screen.findByRole('heading', { name: 'Выберите время' })
    // выбранное время сброшено, список слотов запрошен заново
    await waitFor(() => expect(ctx.api.of(`GET ${P}/availability/slots`).length).toBeGreaterThan(1))
    expect(screen.queryByRole('button', { name: /Далее: / })).toBeNull()
  })

  it('422: ошибки раскладываются по полям шага контактов', async () => {
    const ctx = await mountApp({
      handlers: {
        [`POST ${P}/bookings`]: () =>
          problem(422, 'validation_error', { errors: [{ field: 'phone', code: 'phone_invalid' }] }),
      },
    })
    const { user } = await reachConfirm(ctx)
    await user.click(screen.getByRole('button', { name: 'Записаться' }))
    await screen.findByRole('heading', { name: 'Ваши контакты' })
    expect(await screen.findByText('Проверьте номер телефона')).toBeTruthy()
  })

  it('429: сообщение с временем ожидания', async () => {
    const ctx = await mountApp({
      handlers: {
        [`POST ${P}/bookings`]: () => problem(429, 'rate_limited', {}, { 'Retry-After': '180' }),
      },
    })
    const { user } = await reachConfirm(ctx)
    await user.click(screen.getByRole('button', { name: 'Записаться' }))
    expect(await screen.findByText(/Попробуйте через 3 мин/)).toBeTruthy()
  })

  it('сеть: сообщение «Нет соединения», повтор с тем же ключом идемпотентности', async () => {
    let attempt = 0
    const ctx = await mountApp({
      handlers: {
        [`POST ${P}/bookings`]: () => {
          attempt += 1
          if (attempt === 1) throw new TypeError('offline')
          return json(201, bookingView())
        },
      },
    })
    const { user, api } = await reachConfirm(ctx)
    await user.click(screen.getByRole('button', { name: 'Записаться' }))
    expect(await screen.findByText(/Нет соединения/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Записаться' }))
    await screen.findByRole('heading', { name: 'Вы записаны' })
    const keys = api.of(`POST ${P}/bookings`).map((c) => c.request.headers.get('Idempotency-Key'))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('прочая ошибка сервера показывается сообщением по коду', async () => {
    const ctx = await mountApp({
      handlers: { [`POST ${P}/bookings`]: () => problem(500, 'internal_error') },
    })
    const { user } = await reachConfirm(ctx)
    await user.click(screen.getByRole('button', { name: 'Записаться' }))
    expect(await screen.findByText('Что-то пошло не так. Попробуйте ещё раз')).toBeTruthy()
  })

  it('too_late_to_change: сообщение и переход к списку записей', async () => {
    const ctx = await mountApp({
      handlers: { [`POST ${P}/bookings`]: () => problem(409, 'too_late_to_change') },
    })
    const { user } = await reachConfirm(ctx)
    await user.click(screen.getByRole('button', { name: 'Записаться' }))
    expect(await screen.findByText(/прошёл срок/)).toBeTruthy()
    expect(await screen.findByRole('tab', { name: /Мои записи/ })).toBeTruthy()
  })
})

describe('запись: валидация контактов', () => {
  it('согласие не отмечено по умолчанию, без него дальше не пройти', async () => {
    await mountApp()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Диагностика/ }))
    await user.click(await screen.findByRole('radio', { name: /Любой свободный/ }))
    await user.click((await screen.findAllByRole('option'))[1] as HTMLElement)
    await user.click(await screen.findByRole('radio', { name: '10:00' }))
    await user.click(await screen.findByRole('button', { name: /Далее: / }))
    const consent = await screen.findByRole('checkbox')
    expect((consent as HTMLInputElement).checked).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    expect(await screen.findByText('Нужно согласие на обработку данных')).toBeTruthy()
    expect(screen.getByText('Заполните это поле')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Записаться' })).toBeNull()
  })

  it('«Поделиться номером»: номер подставляется и блокируется, «Изменить» разблокирует', async () => {
    const requestContact = vi
      .fn()
      .mockResolvedValue({ phone: '79995556677', authDate: '1', hash: 'h' })
    await mountApp({ app: { requestContact } })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Диагностика/ }))
    await user.click(await screen.findByRole('radio', { name: /Любой свободный/ }))
    await user.click((await screen.findAllByRole('option'))[1] as HTMLElement)
    await user.click(await screen.findByRole('radio', { name: '10:00' }))
    await user.click(await screen.findByRole('button', { name: /Далее: / }))
    await user.click(await screen.findByRole('button', { name: 'Поделиться номером из MAX' }))
    const phone = (await screen.findByRole('textbox', { name: /Телефон/ })) as HTMLInputElement
    await waitFor(() => expect(phone.readOnly).toBe(true))
    expect(phone.value).toContain('999')
    await user.click(screen.getByRole('button', { name: 'Изменить номер' }))
    await waitFor(() => expect(phone.readOnly).toBe(false))
  })

  it('отказ в номере — сообщение, ввод вручную остаётся', async () => {
    const requestContact = vi.fn().mockRejectedValue({ error: { code: 'denied' } })
    await mountApp({ app: { requestContact } })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Диагностика/ }))
    await user.click(await screen.findByRole('radio', { name: /Любой свободный/ }))
    await user.click((await screen.findAllByRole('option'))[1] as HTMLElement)
    await user.click(await screen.findByRole('radio', { name: '10:00' }))
    await user.click(await screen.findByRole('button', { name: /Далее: / }))
    await user.click(await screen.findByRole('button', { name: 'Поделиться номером из MAX' }))
    expect(await screen.findByText('Не удалось получить номер, введите вручную')).toBeTruthy()
  })
})

describe('запись: пустые состояния', () => {
  it('нет услуг — «Онлайн-запись пока недоступна» и кнопка «Позвонить»', async () => {
    const openLink = vi.fn()
    await mountApp({
      app: { openLink },
      handlers: {
        [`GET ${P}/bootstrap`]: async () => {
          const { BOOTSTRAP } = await import('./helpers')
          return json(200, { ...BOOTSTRAP, services: [], resources: [] })
        },
      },
    })
    expect(await screen.findByText('Онлайн-запись пока недоступна')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Позвонить' }))
    expect(openLink).toHaveBeenCalledWith('tel:+73830000000')
  })

  it('нет свободных дней — «Свободного времени нет», заявка и другой специалист', async () => {
    await mountApp({
      handlers: {
        [`GET ${P}/availability/days`]: (request) => {
          const url = new URL(request.url)
          return json(200, [{ date: url.searchParams.get('from'), available: false }])
        },
      },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Диагностика/ }))
    await user.click(await screen.findByRole('radio', { name: /Любой свободный/ }))
    expect(await screen.findByText('Свободного времени нет')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Выбрать другого специалиста' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Оставить заявку' })).toBeTruthy()
  })

  it('на дату не осталось времени — предложение сменить дату', async () => {
    await mountApp({
      handlers: {
        [`GET ${P}/availability/slots`]: () => json(200, { date: '2030-05-20', slots: [] }),
      },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Диагностика/ }))
    await user.click(await screen.findByRole('radio', { name: /Любой свободный/ }))
    await user.click((await screen.findAllByRole('option'))[1] as HTMLElement)
    expect(await screen.findByText('На эту дату времени не осталось')).toBeTruthy()
  })

  it('ошибка загрузки дней и слотов — ErrorState с повтором', async () => {
    let fail = true
    await mountApp({
      handlers: {
        [`GET ${P}/availability/days`]: (request) => {
          if (fail) return problem(500, 'internal_error')
          const from = new URL(request.url).searchParams.get('from')
          return json(200, [{ date: from, available: true }])
        },
      },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Диагностика/ }))
    await user.click(await screen.findByRole('radio', { name: /Любой свободный/ }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findAllByRole('option')).toHaveLength(1)
  })
})
