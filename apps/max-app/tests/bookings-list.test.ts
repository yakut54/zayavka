import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setMaxBridge } from '../src/bridge/useMaxBridge'
import { RES_1, bookingView, json, mountApp, problem } from './helpers'

const P = '/api/v1/max/app'

afterEach(() => {
  vi.restoreAllMocks()
  setMaxBridge(null)
})

const upcoming = bookingView()
const noChange = bookingView({
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  public_number: 8,
  can_change: false,
})
const pastItem = bookingView({
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  public_number: 5,
  status: 'completed',
  can_change: false,
})

function listHandler(items: unknown[], pastItems: unknown[] = []) {
  return (request: Request) => {
    const scope = new URL(request.url).searchParams.get('scope')
    const list = scope === 'past' ? pastItems : items
    return json(200, { items: list, page: 1, total: list.length })
  }
}

describe('Мои записи', () => {
  it('бейдж с числом предстоящих, карточки и подсказка «по телефону»', async () => {
    const openLink = vi.fn()
    await mountApp({
      path: '/?tab=mine',
      app: { openLink },
      handlers: { [`GET ${P}/bookings`]: listHandler([upcoming, noChange]) },
    })
    expect(await screen.findByText('№ 7')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Мои записи/ }).textContent).toContain('2')
    expect(screen.getAllByText('Подтверждена')).toHaveLength(2)
    expect(screen.getByText('Изменить запись можно по телефону')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Позвонить' }))
    expect(openLink).toHaveBeenCalledWith('tel:+73830000000')
  })

  it('пусто: «У вас пока нет записей» и переход к записи', async () => {
    await mountApp({ path: '/?tab=mine' })
    expect(await screen.findByText('У вас пока нет записей')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Записаться' }))
    expect(await screen.findByRole('radio', { name: /Диагностика/ })).toBeTruthy()
  })

  it('прошедшие: статус без кнопок изменения', async () => {
    await mountApp({
      path: '/?tab=mine',
      handlers: { [`GET ${P}/bookings`]: listHandler([upcoming], [pastItem]) },
    })
    await screen.findByText('№ 7')
    await userEvent.click(screen.getByRole('tab', { name: 'Прошедшие' }))
    expect(await screen.findByText('Завершена')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Отменить' })).toBeNull()
    expect(screen.queryByText('Изменить запись можно по телефону')).toBeNull()
  })

  it('ошибка загрузки — ErrorState с повтором', async () => {
    let fail = true
    await mountApp({
      path: '/?tab=mine',
      handlers: {
        [`GET ${P}/bookings`]: () =>
          fail ? problem(500, 'internal_error') : json(200, { items: [], page: 1, total: 0 }),
      },
    })
    const retry = await screen.findByRole('button', { name: 'Повторить' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('У вас пока нет записей')).toBeTruthy()
  })

  it('подгрузка следующей страницы', async () => {
    const second = bookingView({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', public_number: 9 })
    await mountApp({
      path: '/?tab=mine',
      handlers: {
        [`GET ${P}/bookings`]: (request) => {
          const url = new URL(request.url)
          return url.searchParams.get('page') === '2'
            ? json(200, { items: [second], page: 2, total: 2 })
            : json(200, { items: [upcoming], page: 1, total: 2 })
        },
      },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Показать ещё' }))
    expect(await screen.findByText('№ 9')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull())
  })
})

describe('отмена записи', () => {
  it('диалог → отмена с версией → уведомление', async () => {
    let cancelled = false
    const ctx = await mountApp({
      path: '/?tab=mine',
      handlers: {
        [`GET ${P}/bookings`]: (request) =>
          cancelled ? listHandler([])(request) : listHandler([upcoming])(request),
        [`POST ${P}/bookings/${upcoming.id}/cancel`]: () => {
          cancelled = true
          return json(200, bookingView({ status: 'cancelled_by_client', can_change: false }))
        },
      },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Отменить' }))
    const dialog = await screen.findByRole('dialog', { hidden: true })
    expect(within(dialog).getByText(/Отменить запись на 20 мая/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Отменить запись', hidden: true }))
    expect(await screen.findByText('Запись отменена')).toBeTruthy()
    const [call] = ctx.api.of(`POST ${P}/bookings/${upcoming.id}/cancel`)
    expect(await call!.request.json()).toEqual({ version: 1 })
    expect(await screen.findByText('У вас пока нет записей')).toBeTruthy()
  })

  it('«Не отменять» закрывает диалог без запроса', async () => {
    const ctx = await mountApp({
      path: '/?tab=mine',
      handlers: { [`GET ${P}/bookings`]: listHandler([upcoming]) },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Отменить' }))
    const dialog = await screen.findByRole('dialog', { hidden: true })
    await user.click(within(dialog).getByRole('button', { name: 'Не отменять', hidden: true }))
    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(false))
    expect(ctx.api.calls.some((call) => call.key.includes('/cancel'))).toBe(false)
  })

  it('409 too_late_to_change: сообщение и обновление списка', async () => {
    const ctx = await mountApp({
      path: '/?tab=mine',
      handlers: {
        [`GET ${P}/bookings`]: listHandler([upcoming]),
        [`POST ${P}/bookings/${upcoming.id}/cancel`]: () => problem(409, 'too_late_to_change'),
      },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Отменить' }))
    const dialog = await screen.findByRole('dialog', { hidden: true })
    await user.click(within(dialog).getByRole('button', { name: 'Отменить запись', hidden: true }))
    expect(await screen.findByText(/прошёл срок/)).toBeTruthy()
    await waitFor(() => expect(ctx.api.of(`GET ${P}/bookings`).length).toBeGreaterThan(2))
  })
})

describe('перенос записи', () => {
  it('дата → время → подтверждение → reschedule с версией и ключом', async () => {
    const ctx = await mountApp({
      path: '/?tab=mine',
      handlers: {
        [`GET ${P}/bookings`]: listHandler([upcoming]),
        [`POST ${P}/bookings/${upcoming.id}/reschedule`]: () =>
          json(
            201,
            bookingView({ starts_at: '2030-05-20T08:00:00Z', ends_at: '2030-05-20T09:00:00Z' }),
          ),
      },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Перенести' }))
    // в переносе шаги: дата, время, подтверждение
    expect(await screen.findByText('Шаг 1 из 3')).toBeTruthy()
    await user.click((await screen.findAllByRole('option'))[1] as HTMLElement)
    await user.click(await screen.findByRole('radio', { name: '15:00' }))
    await user.click(await screen.findByRole('button', { name: /Далее: 15:00–16:00/ }))
    await user.click(await screen.findByRole('button', { name: 'Записаться' }))
    const dialog = await screen.findByRole('dialog', { hidden: true })
    expect(within(dialog).getByText(/20.05.*10:00.*20.05.*15:00/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Перенести', hidden: true }))
    expect(await screen.findByRole('heading', { name: 'Вы записаны' })).toBeTruthy()
    const [call] = ctx.api.of(`POST ${P}/bookings/${upcoming.id}/reschedule`)
    expect(await call!.request.json()).toEqual({
      starts_at: '2030-05-20T08:00:00Z',
      resource_id: RES_1.id,
      version: 1,
    })
    expect(call!.request.headers.get('Idempotency-Key')).toBeTruthy()
  })

  it('«Другой специалист» добавляет шаг специалиста и сбрасывает выбор', async () => {
    const ctx = await mountApp({
      path: '/?tab=mine',
      handlers: { [`GET ${P}/bookings`]: listHandler([upcoming]) },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Перенести' }))
    await screen.findAllByRole('option')
    await user.click(screen.getByRole('button', { name: 'Другой специалист' }))
    expect(await screen.findByText('Шаг 1 из 4')).toBeTruthy()
    await user.click(await screen.findByRole('radio', { name: /Пётр/ }))
    await screen.findAllByRole('option')
    const days = ctx.api.of(`GET ${P}/availability/days`)
    expect(new URL(days.at(-1)!.request.url).searchParams.get('resource')).not.toBe(RES_1.id)
  })

  it('409 slot_taken при переносе возвращает на выбор времени', async () => {
    await mountApp({
      path: '/?tab=mine',
      handlers: {
        [`GET ${P}/bookings`]: listHandler([upcoming]),
        [`POST ${P}/bookings/${upcoming.id}/reschedule`]: () => problem(409, 'slot_taken'),
      },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Перенести' }))
    await user.click((await screen.findAllByRole('option'))[1] as HTMLElement)
    await user.click(await screen.findByRole('radio', { name: '15:00' }))
    await user.click(await screen.findByRole('button', { name: /Далее: / }))
    await user.click(await screen.findByRole('button', { name: 'Записаться' }))
    const dialog = await screen.findByRole('dialog', { hidden: true })
    await user.click(within(dialog).getByRole('button', { name: 'Перенести', hidden: true }))
    expect(await screen.findByText('Это время только что заняли')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Выберите время' })).toBeTruthy()
  })
})

describe('заявка, если нет времени', () => {
  const lead = (request: Request) => request.json()

  it('предзаполнена, отправляется с source из сессии и показывает номер', async () => {
    const ctx = await mountApp({
      handlers: {
        [`GET ${P}/availability/days`]: (request) =>
          json(200, [{ date: new URL(request.url).searchParams.get('from'), available: false }]),
        [`POST ${P}/leads`]: () => json(201, { public_number: 42 }),
      },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Диагностика/ }))
    await user.click(await screen.findByRole('radio', { name: /Любой свободный/ }))
    await user.click(await screen.findByRole('link', { name: 'Оставить заявку' }))
    const message = (await screen.findByRole('textbox', {
      name: /Сообщение/,
    })) as HTMLTextAreaElement
    expect(message.value).toContain('Диагностика')
    await user.type(screen.getByRole('textbox', { name: /Телефон/ }), '9991234567')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }))
    expect(await screen.findByText('Заявка № 42 принята')).toBeTruthy()
    const [call] = ctx.api.of(`POST ${P}/leads`)
    expect(await lead(call!.request)).toMatchObject({
      name: 'Анна',
      phone: '+79991234567',
      service_slug: 'diagnostics',
      consent: true,
      policy_version: '2026-01',
      website: '',
    })
  })

  it('без согласия не отправляется; 429 показывает ожидание', async () => {
    await mountApp({
      path: '/request',
      handlers: {
        [`POST ${P}/leads`]: () => problem(429, 'rate_limited', {}, { 'Retry-After': '120' }),
      },
    })
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: /Телефон/ }), '9991234567')
    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }))
    expect(await screen.findByText('Нужно согласие на обработку данных')).toBeTruthy()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }))
    expect(await screen.findByText(/Попробуйте через 2 мин/)).toBeTruthy()
  })

  it('422 раскладывается по полям, прочая ошибка — сообщением', async () => {
    let status = 422
    await mountApp({
      path: '/request',
      handlers: {
        [`POST ${P}/leads`]: () =>
          status === 422
            ? problem(422, 'validation_error', {
                errors: [{ field: 'phone', code: 'phone_invalid' }],
              })
            : problem(500, 'internal_error'),
      },
    })
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: /Телефон/ }), '9991234567')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }))
    expect(await screen.findAllByText('Проверьте номер телефона')).not.toHaveLength(0)
    status = 500
    const phone = screen.getByRole('textbox', { name: /Телефон/ })
    await user.clear(phone)
    await user.type(phone, '9990001122')
    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }))
    expect(await screen.findByText('Что-то пошло не так. Попробуйте ещё раз')).toBeTruthy()
  })
})

describe('экран успеха', () => {
  it('«Добавить в календарь» скачивает файл через мост, ошибка — сообщением', async () => {
    const downloadFile = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true })
    const ctx = await mountApp({
      app: { downloadFile },
      handlers: {
        [`POST ${P}/bookings`]: () => json(201, bookingView()),
        [`GET ${P}/bookings/${upcoming.id}/calendar.ics`]: () =>
          new Response('BEGIN:VCALENDAR', { headers: { 'Content-Type': 'text/calendar' } }),
      },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Шиномонтаж/ }))
    await user.click((await screen.findAllByRole('option'))[1] as HTMLElement)
    await user.click(await screen.findByRole('radio', { name: '10:00' }))
    await user.click(await screen.findByRole('button', { name: /Далее: / }))
    await user.type(await screen.findByRole('textbox', { name: /Телефон/ }), '9991234567')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await user.click(await screen.findByRole('button', { name: 'Записаться' }))
    await user.click(await screen.findByRole('button', { name: 'Добавить в календарь' }))
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith('blob:x', 'booking-7.ics'))
    expect(ctx.api.of(`GET ${P}/bookings/${upcoming.id}/calendar.ics`)).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Мои записи' }))
    expect(await screen.findByRole('tab', { name: /Мои записи/ })).toBeTruthy()
  })

  it('файл не сохранился — сообщение; без записи экран уводит на главную', async () => {
    await mountApp({ path: '/done' })
    expect(await screen.findByRole('radio', { name: /Диагностика/ })).toBeTruthy()
  })
})
