import { ApiError } from '@app/api-client'
import { i18n } from '@app/i18n'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'

import App from '../src/App.vue'
import { createQueryClient } from '../src/queryClient'
import { createAppRouter } from '../src/router'

const apiMock = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
}))
vi.mock('../src/api', () => ({ api: apiMock }))

const ME = { id: 'u1', email: 'owner@example.ru' }
const R1 = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Иван',
  title: 'Мастер',
  is_active: true,
  sort_order: 0,
  service_slugs: ['diagnostics', 'tires'],
}
const R2 = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Пётр',
  title: null,
  is_active: true,
  sort_order: 1,
  service_slugs: [],
}
const DAY = '2024-05-20'
const BOOKING = {
  id: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',
  public_number: 45,
  status: 'confirmed',
  service: { slug: 'diagnostics', title: 'Диагностика' },
  resource: { id: R1.id, name: 'Иван', title: 'Мастер' },
  starts_at: '2024-05-20T03:00:00Z',
  ends_at: '2024-05-20T04:00:00Z',
  client_name: 'Анна',
  client_phone_e164: '+79991234567',
  comment: 'Позвонить заранее',
  source: 'max',
  phone_source: 'max_contact',
  has_max: true,
  is_demo: false,
  cancel_reason: null,
  rescheduled_from_id: null,
  anonymized_at: null,
  version: 1,
  created_at: '2024-05-18T10:00:00Z',
}
const DETAIL = {
  booking: BOOKING,
  events: [
    { id: 'e1', type: 'created', actor: null, payload: {}, created_at: '2024-05-18T10:00:00Z' },
    {
      id: 'e2',
      type: 'status_changed',
      actor: { id: 'u1', email: 'owner@example.ru' },
      payload: { from: 'confirmed', to: 'completed' },
      created_at: '2024-05-20T05:00:00Z',
    },
    {
      id: 'e3',
      type: 'cancelled',
      actor: null,
      payload: { by: 'client', reason: null },
      created_at: '2024-05-19T05:00:00Z',
    },
    { id: 'e4', type: 'rescheduled', actor: null, payload: {}, created_at: '2024-05-19T06:00:00Z' },
    {
      id: 'e5',
      type: 'note_added',
      actor: { id: 'u1', email: 'owner@example.ru' },
      payload: { text: 'Заметка' },
      created_at: '2024-05-19T07:00:00Z',
    },
  ],
}
const SETTINGS = {
  slot_step_min: 15,
  min_lead_min: 120,
  horizon_days: 30,
  cancel_deadline_min: 1440,
  reminders_enabled: true,
  version: 4,
}
const SLOTS = {
  date: DAY,
  slots: [
    { starts_at: '2024-05-20T05:00:00Z', ends_at: '2024-05-20T06:00:00Z', resource_ids: [R1.id] },
  ],
}

type Options = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (options?: Options) => unknown
let routes: Record<string, Handler>

function install(overrides: Record<string, Handler> = {}): void {
  routes = {
    'GET /api/v1/admin/auth/me': () => ({ data: ME }),
    'GET /api/v1/admin/leads': () => ({ data: { items: [], page: 1, page_size: 10, total: 0 } }),
    'GET /api/v1/admin/bookings': () => ({
      data: { items: [BOOKING], page: 1, page_size: 25, total: 1 },
    }),
    'GET /api/v1/admin/bookings/calendar': () => ({
      data: {
        date: DAY,
        resources: [R1, R2],
        bookings: [
          BOOKING,
          { ...BOOKING, id: 'gone', status: 'cancelled_by_client', client_name: 'Отменённый' },
        ],
        working: {
          [R1.id]: [
            [540, 780],
            [840, 1080],
          ],
          [R2.id]: [],
        },
      },
    }),
    'GET /api/v1/admin/bookings/{booking_id}': () => ({ data: DETAIL }),
    'GET /api/v1/admin/bookings/slots': () => ({ data: SLOTS }),
    'GET /api/v1/admin/booking-settings': () => ({ data: SETTINGS }),
    'GET /api/v1/admin/resources': () => ({ data: [R1, R2] }),
    ...overrides,
  }
  const call = (method: string) => (path: string, options?: Options) => {
    const handler = routes[`${method} ${path}`]
    if (!handler) return Promise.reject(new Error(`нет обработчика ${method} ${path}`))
    try {
      return Promise.resolve(handler(options))
    } catch (error) {
      return Promise.reject(error)
    }
  }
  for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const) {
    apiMock[method].mockImplementation(call(method))
  }
}

async function mountAt(path: string) {
  const queryClient = createQueryClient(() => undefined)
  const router = createAppRouter(queryClient, createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [createPinia(), router, i18n, [VueQueryPlugin, { queryClient }]] },
  })
  await flushPromises()
  return { wrapper, router, queryClient }
}

const text = () => document.body.textContent ?? ''
const button = (name: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as
    HTMLButtonElement | undefined
const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error('элемент не найден')
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
}
const type = async (el: Element | null, value: string) => {
  const input = el as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
const calls = (method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'GET', path: string) =>
  apiMock[method].mock.calls.filter(([p]) => p === path)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  install()
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('календарь дня', () => {
  it('колонки сотрудников, блок записи, отменённые не показываются; счётчик в меню', async () => {
    await mountAt(`/bookings?date=${DAY}`)
    expect(document.querySelector('h1')?.textContent).toBe('Записи')
    const titles = [...document.querySelectorAll('.ui-timegrid__title')].map((n) =>
      n.textContent?.trim(),
    )
    expect(titles).toEqual(['Иван (Мастер)', 'Пётр'])
    const events = [...document.querySelectorAll('.ui-timegrid__event')]
    expect(events).toHaveLength(1)
    expect(events[0]?.getAttribute('aria-label')).toBe('Диагностика Анна, 10:00–11:00')
    expect(text()).not.toContain('Отменённый')
    // нерабочее время: у Ивана перерыв и край дня, у Петра весь день
    expect(document.querySelectorAll('.ui-timegrid__off').length).toBeGreaterThanOrEqual(3)
    expect(text()).toContain('Сегодня: 1')
  })

  it('нет активных сотрудников — подсказка', async () => {
    install({
      'GET /api/v1/admin/bookings/calendar': () => ({
        data: { date: DAY, resources: [], bookings: [], working: {} },
      }),
    })
    await mountAt(`/bookings?date=${DAY}`)
    expect(text()).toContain('Нет активных сотрудников')
  })

  it('ошибка загрузки — ErrorState с повтором', async () => {
    let fail = true
    install({
      'GET /api/v1/admin/bookings/calendar': () => {
        if (fail) throw new ApiError({ status: 400, code: 'bad_request' })
        return {
          data: { date: DAY, resources: [R1], bookings: [], working: { [R1.id]: [[540, 1080]] } },
        }
      },
    })
    await mountAt(`/bookings?date=${DAY}`)
    fail = false
    await click(button('Повторить'))
    expect(document.querySelector('.ui-timegrid')).not.toBeNull()
  })

  it('навигация по дням меняет дату в URL', async () => {
    const { router } = await mountAt(`/bookings?date=${DAY}`)
    await click(document.querySelector('[aria-label="Следующий день"]'))
    expect(router.currentRoute.value.query.date).toBe('2024-05-21')
    await click(document.querySelector('[aria-label="Предыдущий день"]'))
    await click(document.querySelector('[aria-label="Предыдущий день"]'))
    expect(router.currentRoute.value.query.date).toBe('2024-05-19')
    await click(button('Сегодня'))
    expect(router.currentRoute.value.query.date).toBeUndefined()
    await click(document.querySelector('[role="tab"]:nth-child(2)'))
    expect(router.currentRoute.value.query.view).toBe('list')
  })
})

describe('карточка записи', () => {
  it('данные клиента, история, «Пришёл» отправляет статус с версией', async () => {
    apiMock.PATCH.mockImplementation(() =>
      Promise.resolve({ data: { ...BOOKING, status: 'completed' } }),
    )
    install({
      'PATCH /api/v1/admin/bookings/{booking_id}': () => ({
        data: { ...BOOKING, status: 'completed' },
      }),
    })
    await mountAt(`/bookings/${BOOKING.id}?date=${DAY}`)
    expect(text()).toContain('Запись № 45')
    expect(text()).toContain('Анна')
    expect(text()).toContain('+7 (999) 123-45-67')
    expect(text()).toContain('Номер подтверждён MAX')
    expect(text()).toContain('Позвонить заранее')
    expect(text()).toContain('Запись создана')
    expect(text()).toContain('Статус: Подтверждена → Пришёл')
    expect(text()).toContain('Отмена (клиентом)')
    expect(text()).toContain('Заметка')
    await click(button('Пришёл'))
    const [patch] = calls('PATCH', '/api/v1/admin/bookings/{booking_id}')
    expect(patch?.[1].body).toMatchObject({ status: 'completed', version: 1 })
  })

  it('«Не пришёл» тоже отправляет статус', async () => {
    install({
      'PATCH /api/v1/admin/bookings/{booking_id}': () => ({ data: BOOKING }),
    })
    await mountAt(`/bookings/${BOOKING.id}?date=${DAY}`)
    await click(button('Не пришёл'))
    expect(calls('PATCH', '/api/v1/admin/bookings/{booking_id}')[0]?.[1].body.status).toBe(
      'no_show',
    )
  })

  it('отмена: причина обязательна, уведомление клиента передаётся', async () => {
    install({ 'PATCH /api/v1/admin/bookings/{booking_id}': () => ({ data: BOOKING }) })
    await mountAt(`/bookings/${BOOKING.id}?date=${DAY}`)
    await click(button('Отменить'))
    await click(button('Отменить запись'))
    expect(text()).toContain('Заполните это поле')
    expect(calls('PATCH', '/api/v1/admin/bookings/{booking_id}')).toHaveLength(0)
    const reason = document.querySelector('dialog dialog textarea')
    await type(reason, ' Мастер заболел ')
    await click(button('Отменить запись'))
    const body = calls('PATCH', '/api/v1/admin/bookings/{booking_id}')[0]?.[1].body
    expect(body).toEqual({
      status: 'cancelled_by_business',
      version: 1,
      cancel_reason: 'Мастер заболел',
      notify_client: true,
    })
  })

  it('409 версии: сообщение и перечитывание записи', async () => {
    install({
      'PATCH /api/v1/admin/bookings/{booking_id}': () => {
        throw new ApiError({ status: 409, code: 'version_conflict' })
      },
    })
    await mountAt(`/bookings/${BOOKING.id}?date=${DAY}`)
    const before = calls('GET', '/api/v1/admin/bookings/{booking_id}').length
    await click(button('Пришёл'))
    expect(calls('GET', '/api/v1/admin/bookings/{booking_id}').length).toBeGreaterThan(before)
  })

  it('перенос: свободные слоты, новое время и уведомление уходят в запрос', async () => {
    install({
      'POST /api/v1/admin/bookings/{booking_id}/reschedule': () => ({ data: BOOKING }),
    })
    await mountAt(`/bookings/${BOOKING.id}?date=${DAY}`)
    await click(button('Перенести'))
    expect(text()).toContain('Перенос записи')
    const slotsCall = calls('GET', '/api/v1/admin/bookings/slots')[0]?.[1].params.query
    expect(slotsCall).toMatchObject({ service: 'diagnostics', ignore_lead_time: true })
    const selects = [...document.querySelectorAll('.move select')] as HTMLSelectElement[]
    const time = selects[1] as HTMLSelectElement
    time.value = '2024-05-20T05:00:00Z'
    time.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    await click(
      button('Перенести'.replace('Перенести', 'Перенести')) &&
        [...document.querySelectorAll('.move button')].find(
          (b) => b.textContent?.trim() === 'Перенести',
        ),
    )
    const [call] = calls('POST', '/api/v1/admin/bookings/{booking_id}/reschedule')
    expect(call?.[1].body).toEqual({
      starts_at: '2024-05-20T05:00:00Z',
      resource_id: R1.id,
      version: 1,
      notify_client: true,
    })
  })

  it('заметка добавляется', async () => {
    install({ 'POST /api/v1/admin/bookings/{booking_id}/notes': () => ({ data: {} }) })
    await mountAt(`/bookings/${BOOKING.id}?date=${DAY}`)
    await type(document.querySelector('textarea'), 'Позвонил')
    await click(button('Добавить заметку'))
    expect(calls('POST', '/api/v1/admin/bookings/{booking_id}/notes')[0]?.[1].body).toEqual({
      text: 'Позвонил',
    })
  })

  it('ошибка загрузки карточки', async () => {
    install({
      'GET /api/v1/admin/bookings/{booking_id}': () => {
        throw new ApiError({ status: 404, code: 'not_found' })
      },
    })
    await mountAt(`/bookings/${BOOKING.id}?date=${DAY}`)
    expect(text()).toContain('Не найдено')
  })
})

describe('список записей', () => {
  it('строка таблицы, источник, фильтры уходят в запрос, экспорт', async () => {
    const { router } = await mountAt('/bookings?view=list')
    expect(text()).toContain('1 запись')
    expect(text()).toContain('Диагностика')
    expect(text()).toContain('MAX')
    expect(text()).toContain('Подтверждена')
    await click(document.querySelector('tbody tr'))
    expect(router.currentRoute.value.params.id).toBe(BOOKING.id)

    const url = vi.fn(() => 'blob:x')
    Object.defineProperty(URL, 'createObjectURL', { value: url, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('csv', {
        headers: { 'Content-Disposition': 'attachment; filename="bookings-2024-05-20.csv"' },
      }),
    )
    await router.push('/bookings?view=list&status=confirmed&from=2024-05-01')
    await flushPromises()
    await click(button('Скачать CSV'))
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/bookings/export.csv?')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=confirmed')
    expect(url).toHaveBeenCalled()
    fetchMock.mockResolvedValue(new Response('x', { status: 500 }))
    await click(button('Скачать CSV'))
    expect(text()).toContain('Не удалось скачать файл')
    fetchMock.mockRestore()
  })

  it('пусто и «ничего не найдено»', async () => {
    install({
      'GET /api/v1/admin/bookings': () => ({
        data: { items: [], page: 1, page_size: 25, total: 0 },
      }),
    })
    const { router } = await mountAt('/bookings?view=list')
    expect(text()).toContain('Записей пока нет')
    await router.push('/bookings?view=list&q=ничего')
    await flushPromises()
    expect(text()).toContain('Ничего не найдено')
    await click(button('Сбросить фильтры'))
    expect(router.currentRoute.value.query.q).toBeUndefined()
  })

  it('слишком большой период и ошибка сервера', async () => {
    install({
      'GET /api/v1/admin/bookings': () => {
        throw new ApiError({ status: 422, code: 'validation_error' })
      },
    })
    await mountAt('/bookings?view=list&from=2024-01-01&to=2024-12-31')
    expect(text()).toContain('Слишком большой период')
  })
})

describe('ручная запись', () => {
  it('клик по свободной ячейке открывает форму с сотрудником и временем, создаёт запись', async () => {
    install({ 'POST /api/v1/admin/bookings': () => ({ data: BOOKING }) })
    await mountAt(`/bookings?date=${DAY}`)
    await click(document.querySelector('.ui-timegrid__track'))
    expect(text()).toContain('Записать клиента')
    const params = calls('GET', '/api/v1/admin/bookings/slots').at(-1)?.[1].params.query
    expect(params).toMatchObject({ date: DAY, resource: R1.id })
    await type(document.querySelector('input[name="name"]'), 'Ручной')
    await type(document.querySelector('input[type="tel"], input[name="phone"]'), '9995550000')
    const slot = document.querySelector('select[name="slot"]') as HTMLSelectElement
    slot.value = SLOTS.slots[0]!.starts_at
    slot.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    await click(button('Записать'))
    const [create] = calls('POST', '/api/v1/admin/bookings')
    expect(create?.[1].body).toMatchObject({
      service_slug: expect.any(String),
      resource_id: R1.id,
      starts_at: '2024-05-20T05:00:00Z',
      name: 'Ручной',
      phone: '+79995550000',
      notify_client: false,
    })
  })

  it('валидация: пустые поля, 409 занято сбрасывает время', async () => {
    install({
      'POST /api/v1/admin/bookings': () => {
        throw new ApiError({ status: 409, code: 'slot_taken' })
      },
    })
    await mountAt(`/bookings?date=${DAY}`)
    await click(button('Записать клиента'))
    await click(button('Записать'))
    expect(text()).toContain('Заполните это поле')
    expect(calls('POST', '/api/v1/admin/bookings')).toHaveLength(0)
    await type(document.querySelector('input[name="name"]'), 'Ручной')
    await type(document.querySelector('input[name="phone"]'), '9995550000')
    const slot = document.querySelector('select[name="slot"]') as HTMLSelectElement
    slot.value = SLOTS.slots[0]!.starts_at
    slot.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    await click(button('Записать'))
    expect(text()).toContain('Это время только что заняли')
  })
})

describe('сотрудники', () => {
  it('список с услугами и статусом, порядок переписывается', async () => {
    install({ 'PATCH /api/v1/admin/resources/{resource_id}': () => ({ data: R1 }) })
    await mountAt('/resources')
    expect(text()).toContain('Иван')
    expect(text()).toContain('Мастер')
    expect(text()).toContain('Активен')
    expect(text()).toContain('Услуги не назначены')
    await click(document.querySelectorAll('[aria-label="Опустить ниже"]')[0])
    const bodies = calls('PATCH', '/api/v1/admin/resources/{resource_id}').map(([, o]) => o.body)
    expect(bodies).toEqual(expect.arrayContaining([{ sort_order: 0 }, { sort_order: 1 }]))
    expect(calls('PATCH', '/api/v1/admin/resources/{resource_id}')).toHaveLength(2)
  })

  it('создание: имя, услуги → POST и PUT services', async () => {
    install({
      'POST /api/v1/admin/resources': () => ({ data: { ...R2, id: 'new', name: 'Новый' } }),
      'PUT /api/v1/admin/resources/{resource_id}/services': () => ({ data: R1 }),
    })
    await mountAt('/resources')
    await click(button('Добавить сотрудника'))
    await click(button('Добавить'))
    expect(text()).toContain('Заполните это поле')
    await type(document.querySelector('input[name="name"]'), 'Новый')
    await click(document.querySelector('input[name="service-tires"]'))
    await click(button('Добавить'))
    expect(calls('POST', '/api/v1/admin/resources')[0]?.[1].body).toMatchObject({
      name: 'Новый',
      sort_order: 2,
    })
    expect(calls('PUT', '/api/v1/admin/resources/{resource_id}/services')[0]?.[1]).toMatchObject({
      params: { path: { resource_id: 'new' } },
      body: { service_slugs: ['tires'] },
    })
  })

  it('профиль: сохранение, скрытие при будущих записях, удаление', async () => {
    install({
      'PATCH /api/v1/admin/resources/{resource_id}': () => ({ data: R1 }),
      'PUT /api/v1/admin/resources/{resource_id}/services': () => ({ data: R1 }),
      'DELETE /api/v1/admin/resources/{resource_id}': () => {
        throw new ApiError({ status: 409, code: 'has_future_bookings' })
      },
    })
    await mountAt(`/resources/${R1.id}`)
    expect(text()).toContain('Сотрудник: Иван')
    await type(document.querySelector('input[name="name"]'), '')
    await click(button('Сохранить'))
    expect(text()).toContain('Заполните это поле')
    await type(document.querySelector('input[name="name"]'), 'Иван Иванов')
    await click(button('Сохранить'))
    expect(calls('PATCH', '/api/v1/admin/resources/{resource_id}')[0]?.[1].body).toMatchObject({
      name: 'Иван Иванов',
      is_active: true,
    })
    expect(calls('PUT', '/api/v1/admin/resources/{resource_id}/services')[0]?.[1].body).toEqual({
      service_slugs: ['diagnostics', 'tires'],
    })
    await click(button('Удалить сотрудника'))
    await click(
      [...document.querySelectorAll('dialog button')].find(
        (b) => b.textContent?.trim() === 'Удалить',
      ),
    )
    expect(text()).toContain('Скрыть сотрудника?')
    await click(
      [...document.querySelectorAll('dialog button')].find(
        (b) => b.textContent?.trim() === 'Скрыть',
      ),
    )
    expect(calls('PATCH', '/api/v1/admin/resources/{resource_id}').at(-1)?.[1].body).toEqual({
      is_active: false,
    })
  })

  it('удаление без будущих записей закрывает карточку', async () => {
    install({ 'DELETE /api/v1/admin/resources/{resource_id}': () => ({ data: undefined }) })
    const { router } = await mountAt(`/resources/${R1.id}`)
    await click(button('Удалить сотрудника'))
    await click(
      [...document.querySelectorAll('dialog button')].find(
        (b) => b.textContent?.trim() === 'Удалить',
      ),
    )
    expect(calls('DELETE', '/api/v1/admin/resources/{resource_id}')).toHaveLength(1)
    expect(router.currentRoute.value.params.id).toBeFalsy()
  })
})

describe('график и исключения', () => {
  const HOURS = { days: { 1: [[540, 1080]], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] } }

  it('сохранение графика; конфликт → диалог → отмена записей и уведомление', async () => {
    let attempt = 0
    install({
      'GET /api/v1/admin/resources/{resource_id}/working-hours': () => ({ data: HOURS }),
      'PUT /api/v1/admin/resources/{resource_id}/working-hours': (options) => {
        attempt += 1
        if (attempt === 1)
          throw new ApiError({
            status: 409,
            code: 'conflicts_with_bookings',
            body: {
              bookings: [
                {
                  id: 'b1',
                  public_number: 45,
                  starts_at: '2024-05-20T03:00:00Z',
                  client_name: 'Анна',
                  service_title: 'Диагностика',
                },
              ],
            },
          })
        return { data: HOURS, options }
      },
    })
    await mountAt(`/resources/${R1.id}`)
    await click([...document.querySelectorAll('[role="tab"]')][1])
    // меняем график: выходной в понедельник
    await click(document.querySelector('.ui-checkbox input'))
    await click(button('Сохранить график'))
    expect(text()).toContain('Изменение затрагивает записи')
    expect(text()).toContain('№ 45')
    await click(button('Отменить эти записи и уведомить клиентов'))
    const puts = calls('PUT', '/api/v1/admin/resources/{resource_id}/working-hours')
    expect(puts).toHaveLength(2)
    expect(puts[0]?.[1].params.query).toEqual({})
    expect(puts[1]?.[1].params.query).toEqual({ force: true, cancel_conflicting: true })
  })

  it('конфликт: «Сохранить и оставить записи» и «Не сохранять»', async () => {
    const conflict = () => {
      throw new ApiError({
        status: 409,
        code: 'conflicts_with_bookings',
        body: { bookings: [] },
      })
    }
    install({
      'GET /api/v1/admin/resources/{resource_id}/working-hours': () => ({ data: HOURS }),
      'PUT /api/v1/admin/resources/{resource_id}/working-hours': (options) => {
        if (!options?.params.query.force) return conflict()
        return { data: HOURS }
      },
    })
    await mountAt(`/resources/${R1.id}`)
    await click([...document.querySelectorAll('[role="tab"]')][1])
    await click(document.querySelector('.ui-checkbox input'))
    await click(button('Сохранить график'))
    await click(button('Не сохранять'))
    expect(calls('PUT', '/api/v1/admin/resources/{resource_id}/working-hours')).toHaveLength(1)
    await click(button('Сохранить график'))
    await click(button('Сохранить и оставить записи'))
    const puts = calls('PUT', '/api/v1/admin/resources/{resource_id}/working-hours')
    expect(puts.at(-1)?.[1].params.query).toEqual({ force: true })
  })

  it('исключения: список, добавление выходного, удаление', async () => {
    install({
      'GET /api/v1/admin/resources/{resource_id}/exceptions': () => ({
        data: [
          { id: 'x1', date: '2030-05-21', kind: 'day_off', intervals: [], note: 'Праздник' },
          {
            id: 'x2',
            date: '2030-05-22',
            kind: 'custom_hours',
            intervals: [{ start_min: 600, end_min: 780 }],
            note: null,
          },
        ],
      }),
      'POST /api/v1/admin/resources/{resource_id}/exceptions': () => ({ data: {} }),
      'DELETE /api/v1/admin/resources/{resource_id}/exceptions/{exception_id}': () => ({
        data: undefined,
      }),
    })
    await mountAt(`/resources/${R1.id}`)
    await click([...document.querySelectorAll('[role="tab"]')][2])
    expect(text()).toContain('Праздник')
    expect(text()).toContain('10:00–13:00')
    await type(document.querySelector('input[type="date"]'), '2030-06-01')
    await click(button('Добавить'))
    expect(
      calls('POST', '/api/v1/admin/resources/{resource_id}/exceptions')[0]?.[1].body,
    ).toMatchObject({
      date: '2030-06-01',
      kind: 'day_off',
      intervals: [],
    })
    await click(document.querySelectorAll('[aria-label="Удалить исключение"]')[0])
    expect(
      calls('DELETE', '/api/v1/admin/resources/{resource_id}/exceptions/{exception_id}')[0]?.[1]
        .params.path,
    ).toEqual({ resource_id: R1.id, exception_id: 'x1' })
  })

  it('особые часы: интервалы уходят минутами, конфликт повторяется с force', async () => {
    let first = true
    install({
      'GET /api/v1/admin/resources/{resource_id}/exceptions': () => ({ data: [] }),
      'POST /api/v1/admin/resources/{resource_id}/exceptions': () => {
        if (first) {
          first = false
          throw new ApiError({
            status: 409,
            code: 'conflicts_with_bookings',
            body: { bookings: [] },
          })
        }
        return { data: {} }
      },
    })
    await mountAt(`/resources/${R1.id}`)
    await click([...document.querySelectorAll('[role="tab"]')][2])
    const kind = [...document.querySelectorAll('select')].find(
      (s) => s.options[1]?.value === 'custom_hours',
    ) as HTMLSelectElement
    kind.value = 'custom_hours'
    kind.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    await click(button('Добавить'))
    expect(text()).toContain('Изменение затрагивает записи')
    await click(button('Сохранить и оставить записи'))
    const posts = calls('POST', '/api/v1/admin/resources/{resource_id}/exceptions')
    expect(posts[0]?.[1].body.intervals).toEqual([{ start_min: 600, end_min: 900 }])
    expect(posts[1]?.[1].params.query).toEqual({ force: true })
  })
})

describe('настройки записи', () => {
  it('значения из сервера, сохранение с версией, 409 перечитывает', async () => {
    let conflict = false
    install({
      'PATCH /api/v1/admin/booking-settings': () => {
        if (conflict) throw new ApiError({ status: 409, code: 'version_conflict' })
        return { data: { ...SETTINGS, version: 5 } }
      },
    })
    await mountAt('/booking-settings')
    expect((document.querySelector('select') as HTMLSelectElement).value).toBe('15')
    expect((document.querySelector('input[name="lead"]') as HTMLInputElement).value).toBe('2')
    expect((document.querySelector('input[name="deadline"]') as HTMLInputElement).value).toBe('24')
    await type(document.querySelector('input[name="horizon"]'), '45')
    await click(button('Сохранить'))
    expect(calls('PATCH', '/api/v1/admin/booking-settings')[0]?.[1].body).toEqual({
      slot_step_min: 15,
      min_lead_min: 120,
      horizon_days: 45,
      cancel_deadline_min: 1440,
      reminders_enabled: true,
      version: 4,
    })
    conflict = true
    const before = calls('GET', '/api/v1/admin/booking-settings').length
    await click(button('Сохранить'))
    expect(calls('GET', '/api/v1/admin/booking-settings').length).toBeGreaterThan(before)
  })

  it('валидация: горизонт и срок вне диапазона не отправляются', async () => {
    await mountAt('/booking-settings')
    await type(document.querySelector('input[name="horizon"]'), '120')
    await type(document.querySelector('input[name="deadline"]'), '999999')
    await click(button('Сохранить'))
    expect(calls('PATCH', '/api/v1/admin/booking-settings')).toHaveLength(0)
    expect(text()).toContain('Проверьте формат')
    expect(text()).toContain('Слишком длинно')
  })
})
