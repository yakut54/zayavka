import { ApiError } from '@app/api-client'
import { i18n } from '@app/i18n'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { createMemoryHistory } from 'vue-router'

import App from '../src/App.vue'
import { createQueryClient } from '../src/queryClient'
import { createAppRouter } from '../src/router'

const apiMock = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() }))
vi.mock('../src/api', () => ({ api: apiMock }))

const LEAD = {
  id: '0192f5c4-0000-7000-8000-000000000001',
  public_number: 123,
  name: 'Иван Петров',
  phone_e164: '+79991234567',
  email: 'ivan@example.ru',
  message: 'Нужна диагностика\nи замена масла',
  service_slug: 'diagnostics',
  source: 'site',
  utm: {},
  status: 'new',
  version: 1,
  anonymized_at: null,
  created_at: '2026-10-20T08:15:00Z',
  updated_at: '2026-10-20T08:15:00Z',
}
const OTHER = {
  ...LEAD,
  id: 'b',
  public_number: 124,
  name: 'Анна',
  status: 'done',
  service_slug: null,
}

const me = { id: 'u1', email: 'owner@example.ru' }
const detail = {
  lead: LEAD,
  events: [
    { id: 'e1', type: 'created', actor: null, payload: {}, created_at: '2026-10-20T08:15:00Z' },
    {
      id: 'e2',
      type: 'status_changed',
      actor: { id: 'u1', email: 'owner@example.ru' },
      payload: { from: 'new', to: 'in_progress' },
      created_at: '2026-10-20T09:00:00Z',
    },
    {
      id: 'e3',
      type: 'note_added',
      actor: { id: 'u1', email: 'owner@example.ru' },
      payload: { text: 'Позвонил\nдоговорились' },
      created_at: '2026-10-20T09:30:00Z',
    },
  ],
}

function respond(path: string, options?: { params?: { query?: Record<string, unknown> } }) {
  if (path === '/api/v1/admin/auth/me') return Promise.resolve({ data: me })
  if (path === '/api/v1/admin/leads') {
    const status = options?.params?.query?.status
    if (status === 'new' && options?.params?.query?.page_size === 10)
      return Promise.resolve({ data: { items: [LEAD], page: 1, page_size: 10, total: 3 } })
    return Promise.resolve({ data: { items: [LEAD, OTHER], page: 1, page_size: 25, total: 2 } })
  }
  if (path === '/api/v1/admin/leads/{lead_id}') return Promise.resolve({ data: detail })
  return Promise.reject(new Error(`unexpected GET ${path}`))
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

async function expectAccessible(element: Element): Promise<void> {
  const results = await axe(element)
  const violations = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)
  if (violations.length > 0) throw new Error(`axe violations:\n${violations.join('\n')}`)
}

beforeEach(() => {
  apiMock.GET.mockReset().mockImplementation(respond)
  apiMock.POST.mockReset().mockResolvedValue({ data: undefined })
  apiMock.PATCH.mockReset().mockResolvedValue({ data: LEAD })
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('защита маршрутов', () => {
  it('без сессии (401 на /me) → вход с next', async () => {
    apiMock.GET.mockRejectedValue(new ApiError({ status: 401, code: 'unauthenticated' }))
    const { router } = await mountAt('/account')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.next).toBe('/account')
  })

  it('корень и неизвестные адреса ведут к заявкам', async () => {
    const { router } = await mountAt('/')
    expect(router.currentRoute.value.path).toBe('/leads')
    await router.push('/нет-такой-страницы')
    expect(router.currentRoute.value.path).toBe('/leads')
  })

  it('вошедший администратор со страницы входа уходит к заявкам', async () => {
    const { router } = await mountAt('/leads')
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/leads')
  })
})

describe('вход', () => {
  async function submitLogin(
    wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'],
    password = 'secret-password',
  ) {
    await wrapper.find('input[name="email"]').setValue('owner@example.ru')
    await wrapper.find('input[name="password"]').setValue(password)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
  }

  beforeEach(() => {
    apiMock.GET.mockImplementation((path: string) =>
      path === '/api/v1/admin/auth/me'
        ? Promise.reject(new ApiError({ status: 401, code: 'unauthenticated' }))
        : respond(path),
    )
  })

  it('форма: поля, autocomplete, доступность', async () => {
    const { wrapper } = await mountAt('/login')
    expect(wrapper.find('h1').text()).toBe('Вход в админку')
    expect(wrapper.find('input[name="email"]').attributes('autocomplete')).toBe('username')
    expect(wrapper.find('input[name="password"]').attributes('autocomplete')).toBe(
      'current-password',
    )
    await expectAccessible(wrapper.element as Element)
  })

  it('пустая отправка: ошибки полей, запрос не уходит', async () => {
    const { wrapper } = await mountAt('/login')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Заполните это поле')
    expect(apiMock.POST).not.toHaveBeenCalled()
  })

  it('успех: переход на next; внешний next игнорируется', async () => {
    const { wrapper, router } = await mountAt('/login?next=https://evil.example')
    apiMock.GET.mockImplementation(respond)
    await submitLogin(wrapper)
    expect(apiMock.POST).toHaveBeenCalledWith('/api/v1/admin/auth/login', {
      body: { email: 'owner@example.ru', password: 'secret-password' },
    })
    expect(router.currentRoute.value.path).toBe('/leads')
  })

  it('успех: возврат на защищённую страницу', async () => {
    const { wrapper, router } = await mountAt('/login?next=/account')
    apiMock.GET.mockImplementation(respond)
    await submitLogin(wrapper)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/account'))
  })

  it('401 → общее сообщение', async () => {
    apiMock.POST.mockRejectedValue(new ApiError({ status: 401, code: 'unauthenticated' }))
    const { wrapper } = await mountAt('/login')
    await submitLogin(wrapper, 'wrong')
    expect(wrapper.find('.ui-alert--danger').text()).toContain('Неверный email или пароль')
    expect(wrapper.find('input[name="email"]').attributes('aria-invalid')).toBeUndefined()
  })

  it('429 → сообщение с минутами', async () => {
    apiMock.POST.mockRejectedValue(
      new ApiError({ status: 429, code: 'rate_limited', retryAfter: 600 }),
    )
    const { wrapper } = await mountAt('/login')
    await submitLogin(wrapper)
    expect(wrapper.find('.ui-alert--warning').text()).toContain('Попробуйте через 10 мин.')
  })

  it('прочие ошибки → internal_error', async () => {
    apiMock.POST.mockRejectedValue(new ApiError({ status: 500, code: 'internal_error' }))
    const { wrapper } = await mountAt('/login')
    await submitLogin(wrapper)
    expect(wrapper.find('.ui-alert--danger').text()).toContain('Что-то пошло не так')
  })
})

describe('список заявок', () => {
  it('таблица: строки, дата в часовом поясе бизнеса, телефон с маской, статусы', async () => {
    const { wrapper } = await mountAt('/leads')
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    const first = rows[0]
    expect(first?.text()).toContain('123')
    expect(first?.text()).toContain('20.10.2026, 15:15')
    expect(first?.text()).toContain('Иван Петров')
    expect(first?.text()).toContain('+7 (999) 123-45-67')
    expect(first?.text()).toContain('Компьютерная диагностика')
    expect(first?.text()).toContain('Новая')
    expect(first?.find('.cell--new').exists()).toBe(true)
    expect(rows[1]?.text()).toContain('—')
    expect(wrapper.text()).toContain('2 заявки')
    expect(wrapper.text()).toContain('Показано 1–2 из 2')
  })

  it('бейдж новых заявок в навигации', async () => {
    const { wrapper } = await mountAt('/leads')
    expect(wrapper.find('nav .ui-badge').text()).toBe('Новых: 3')
  })

  it('клик по строке открывает карточку (URL меняется, фильтры сохраняются)', async () => {
    const { wrapper, router } = await mountAt('/leads?status=new')
    await wrapper.findAll('tbody tr')[0]?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe(LEAD.id)
    expect(router.currentRoute.value.query.status).toBe('new')
  })

  it('запрос списка использует фильтры из URL', async () => {
    await mountAt('/leads?status=done&q=ива&page=2&date_from=2026-10-01&sort=created_at')
    const call = apiMock.GET.mock.calls.find(
      ([path, opts]) => path === '/api/v1/admin/leads' && opts?.params?.query?.page === 2,
    )
    expect(call?.[1].params.query).toMatchObject({
      status: 'done',
      q: 'ива',
      page: 2,
      page_size: 25,
      sort: 'created_at',
      date_from: '2026-10-01',
    })
  })

  it('пусто без фильтров', async () => {
    apiMock.GET.mockImplementation((path: string) =>
      path === '/api/v1/admin/leads'
        ? Promise.resolve({ data: { items: [], page: 1, page_size: 25, total: 0 } })
        : respond(path),
    )
    const { wrapper } = await mountAt('/leads')
    expect(wrapper.text()).toContain('Заявок пока нет')
    expect(wrapper.text()).not.toContain('Сбросить фильтры')
  })

  it('пусто с фильтрами: «Ничего не найдено» и сброс', async () => {
    apiMock.GET.mockImplementation((path: string) =>
      path === '/api/v1/admin/leads'
        ? Promise.resolve({ data: { items: [], page: 1, page_size: 25, total: 0 } })
        : respond(path),
    )
    const { wrapper, router } = await mountAt('/leads?q=zzz')
    expect(wrapper.text()).toContain('Ничего не найдено')
    const reset = wrapper.findAll('button').filter((b) => b.text() === 'Сбросить фильтры')
    expect(reset.length).toBeGreaterThan(0)
    await reset[0]?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('ошибка загрузки: ErrorState и «Повторить»', async () => {
    apiMock.GET.mockImplementation((path: string) =>
      path === '/api/v1/admin/leads'
        ? Promise.reject(new ApiError({ status: 400, code: 'bad_request' }))
        : respond(path),
    )
    const { wrapper } = await mountAt('/leads')
    expect(wrapper.find('[role="alert"]').text()).toContain('Некорректный запрос')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Повторить')
      ?.trigger('click')
    await flushPromises()
    expect(
      apiMock.GET.mock.calls.filter(([p]) => p === '/api/v1/admin/leads').length,
    ).toBeGreaterThan(2)
  })

  it('поиск, статус и даты меняют URL и сбрасывают страницу', async () => {
    const { wrapper, router } = await mountAt('/leads?page=3')
    const select = wrapper.find('select')
    await select.setValue('done')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ status: 'done' })
    await wrapper.findAll('input[type="date"]')[0]?.setValue('2026-10-01')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ status: 'done', date_from: '2026-10-01' })
    expect(wrapper.text()).toContain('Сбросить фильтры')
  })

  it('«по» раньше «с» — ошибка поля', async () => {
    const { wrapper } = await mountAt('/leads?date_from=2026-10-10&date_to=2026-10-01')
    expect(wrapper.text()).toContain('Дата «по» не может быть раньше даты «с»')
  })

  it('сортировка по дате переключается', async () => {
    const { wrapper, router } = await mountAt('/leads')
    expect(wrapper.find('th[aria-sort]').attributes('aria-sort')).toBe('descending')
    await wrapper.find('th button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBe('created_at')
  })

  it('доступен', async () => {
    const { wrapper } = await mountAt('/leads')
    await expectAccessible(wrapper.element as Element)
  })
})

describe('карточка заявки', () => {
  it('контакт, сообщение с переносами, история в обратном порядке', async () => {
    const { wrapper } = await mountAt(`/leads/${LEAD.id}`)
    await vi.waitFor(() =>
      expect(document.querySelector('dialog')?.textContent).toContain('Иван Петров'),
    )
    const drawer = wrapper.find('dialog')
    expect(drawer.text()).toContain('Заявка № 123')
    expect(drawer.find('a[href="tel:+79991234567"]').exists()).toBe(true)
    expect(drawer.find('a[href="mailto:ivan@example.ru"]').exists()).toBe(true)
    expect(drawer.text()).toContain('Компьютерная диагностика')
    expect(drawer.find('.lead__message').text()).toContain('Нужна диагностика')
    const events = drawer.findAll('.lead__event')
    expect(events).toHaveLength(3)
    expect(events[0]?.text()).toContain('Позвонил')
    expect(events[1]?.text()).toContain('Статус: Новая → В работе')
    expect(events[1]?.text()).toContain('owner@example.ru')
    expect(events[2]?.text()).toContain('Заявка создана')
  })

  async function openDrawer() {
    const ctx = await mountAt(`/leads/${LEAD.id}`)
    await vi.waitFor(() => expect(document.querySelector('dialog select')).not.toBeNull())
    return ctx
  }

  it('смена статуса отправляет PATCH с текущей версией', async () => {
    const { wrapper } = await openDrawer()
    await wrapper.find('dialog select').setValue('in_progress')
    await flushPromises()
    expect(apiMock.PATCH).toHaveBeenCalledWith('/api/v1/admin/leads/{lead_id}', {
      params: { path: { lead_id: LEAD.id } },
      body: { status: 'in_progress', version: 1 },
    })
    expect(document.body.textContent).toContain('Статус изменён')
  })

  it('«Спам» требует подтверждения', async () => {
    const { wrapper } = await openDrawer()
    await wrapper.find('dialog select').setValue('spam')
    await flushPromises()
    expect(apiMock.PATCH).not.toHaveBeenCalled()
    const dialogs = wrapper.findAll('dialog')
    expect(dialogs.some((d) => d.text().includes('Отметить как спам?'))).toBe(true)
    await wrapper
      .findAll('dialog button')
      .find((b) => b.text() === 'Отметить')
      ?.trigger('click')
    await flushPromises()
    expect(apiMock.PATCH).toHaveBeenCalledWith(
      '/api/v1/admin/leads/{lead_id}',
      expect.objectContaining({ body: { status: 'spam', version: 1 } }),
    )
  })

  it('409 → уведомление и перезагрузка карточки', async () => {
    apiMock.PATCH.mockRejectedValue(new ApiError({ status: 409, code: 'version_conflict' }))
    const { wrapper } = await openDrawer()
    const before = apiMock.GET.mock.calls.length
    await wrapper.find('dialog select').setValue('done')
    await flushPromises()
    expect(document.body.textContent).toContain('Заявку уже изменили')
    expect(apiMock.GET.mock.calls.length).toBeGreaterThan(before)
  })

  it('другая ошибка → общее уведомление', async () => {
    apiMock.PATCH.mockRejectedValue(new ApiError({ status: 500, code: 'internal_error' }))
    const { wrapper } = await openDrawer()
    await wrapper.find('dialog select').setValue('done')
    await flushPromises()
    expect(document.body.textContent).toContain('Что-то пошло не так')
  })

  it('заметка: кнопка неактивна при пустом тексте, отправка очищает поле', async () => {
    apiMock.POST.mockResolvedValue({ data: { id: 'e9' } })
    const { wrapper } = await openDrawer()
    const add = () => wrapper.findAll('dialog button').find((b) => b.text() === 'Добавить заметку')
    expect(add()?.attributes('disabled')).toBeDefined()
    const textarea = wrapper.find('dialog textarea')
    await textarea.setValue('  Позвонил  ')
    expect(add()?.attributes('disabled')).toBeUndefined()
    await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()
    expect(apiMock.POST).toHaveBeenCalledWith('/api/v1/admin/leads/{lead_id}/notes', {
      params: { path: { lead_id: LEAD.id } },
      body: { text: 'Позвонил' },
    })
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
    expect(document.body.textContent).toContain('Заметка добавлена')
  })

  it('ошибка заметки → уведомление, текст сохраняется', async () => {
    apiMock.POST.mockRejectedValue(new ApiError({ status: 500, code: 'internal_error' }))
    const { wrapper } = await openDrawer()
    const textarea = wrapper.find('dialog textarea')
    await textarea.setValue('Текст')
    await wrapper
      .findAll('dialog button')
      .find((b) => b.text() === 'Добавить заметку')
      ?.trigger('click')
    await flushPromises()
    expect((textarea.element as HTMLTextAreaElement).value).toBe('Текст')
    expect(document.body.textContent).toContain('Что-то пошло не так')
  })

  it('404 → ErrorState', async () => {
    apiMock.GET.mockImplementation((path: string) =>
      path === '/api/v1/admin/leads/{lead_id}'
        ? Promise.reject(new ApiError({ status: 404, code: 'not_found' }))
        : respond(path),
    )
    const { wrapper } = await mountAt(`/leads/${LEAD.id}`)
    await vi.waitFor(() => expect(wrapper.find('dialog [role="alert"]').exists()).toBe(true))
    expect(wrapper.find('dialog').text()).toContain('Не найдено')
  })

  it('закрытие возвращает на список с сохранёнными фильтрами', async () => {
    const { wrapper, router } = await mountAt(`/leads/${LEAD.id}?status=new`)
    await vi.waitFor(() => expect(wrapper.find('dialog').exists()).toBe(true))
    await wrapper.find('dialog button[aria-label="Закрыть"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBeUndefined()
    expect(router.currentRoute.value.query.status).toBe('new')
  })

  it('обезличенная заявка помечена', async () => {
    apiMock.GET.mockImplementation((path: string) =>
      path === '/api/v1/admin/leads/{lead_id}'
        ? Promise.resolve({
            data: { ...detail, lead: { ...LEAD, anonymized_at: '2026-10-21T00:00:00Z' } },
          })
        : respond(path),
    )
    const { wrapper } = await mountAt(`/leads/${LEAD.id}`)
    await vi.waitFor(() => expect(wrapper.find('dialog').text()).toContain('обезличены'))
  })
})

describe('аккаунт', () => {
  it('страница: форма и опасное действие, доступность', async () => {
    const { wrapper } = await mountAt('/account')
    expect(wrapper.find('h1').text()).toBe('Аккаунт')
    expect(wrapper.find('input[name="newPassword"]').attributes('autocomplete')).toBe(
      'new-password',
    )
    expect(wrapper.find('input[name="currentPassword"]').attributes('autocomplete')).toBe(
      'current-password',
    )
    await expectAccessible(wrapper.element as Element)
  })

  it('индикатор длины и валидация: слишком короткий, не совпадает', async () => {
    const { wrapper } = await mountAt('/account')
    await wrapper.find('input[name="newPassword"]').setValue('короткий')
    expect(wrapper.text()).toContain('8 из 12 символов')
    await wrapper.find('input[name="newPasswordConfirm"]').setValue('другой')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Слишком коротко')
    expect(wrapper.text()).toContain('Пароли не совпадают')
    expect(apiMock.POST).not.toHaveBeenCalled()
  })

  async function fillPasswords(wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper']) {
    await wrapper.find('input[name="currentPassword"]').setValue('старый-пароль-1')
    await wrapper.find('input[name="newPassword"]').setValue('новый-пароль-12345')
    await wrapper.find('input[name="newPasswordConfirm"]').setValue('новый-пароль-12345')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
  }

  it('успех: запрос, уведомление, форма очищена', async () => {
    const { wrapper } = await mountAt('/account')
    await fillPasswords(wrapper)
    expect(apiMock.POST).toHaveBeenCalledWith('/api/v1/admin/auth/password', {
      body: { current_password: 'старый-пароль-1', new_password: 'новый-пароль-12345' },
    })
    expect(document.body.textContent).toContain('Пароль изменён. Остальные сеансы завершены')
    expect((wrapper.find('input[name="newPassword"]').element as HTMLInputElement).value).toBe('')
  })

  it('422 от сервера раскладывается по полям', async () => {
    apiMock.POST.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'validation_error',
        errors: [{ field: 'current_password', code: 'wrong_password' }],
      }),
    )
    const { wrapper } = await mountAt('/account')
    await fillPasswords(wrapper)
    expect(wrapper.text()).toContain('Неверный пароль')
  })

  it('другая ошибка → уведомление', async () => {
    apiMock.POST.mockRejectedValue(new ApiError({ status: 500, code: 'internal_error' }))
    const { wrapper } = await mountAt('/account')
    await fillPasswords(wrapper)
    expect(document.body.textContent).toContain('Что-то пошло не так')
  })

  it('«Выйти на всех устройствах» — подтверждение, запрос, переход на вход', async () => {
    const { wrapper, router } = await mountAt('/account')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Выйти на всех устройствах')
      ?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Выйти на всех устройствах?')
    apiMock.GET.mockImplementation(() =>
      Promise.reject(new ApiError({ status: 401, code: 'unauthenticated' })),
    )
    await wrapper
      .findAll('dialog button')
      .find((b) => b.text() === 'Выйти везде')
      ?.trigger('click')
    await flushPromises()
    expect(apiMock.POST).toHaveBeenCalledWith('/api/v1/admin/auth/sessions/revoke-all')
    expect(router.currentRoute.value.name).toBe('login')
  })
})

describe('каркас', () => {
  it('шапка: email, выход, переключатель темы, навигация', async () => {
    const { wrapper, router } = await mountAt('/leads')
    expect(wrapper.find('header').text()).toContain('owner@example.ru')
    expect(wrapper.find('a.skip-link, .shell__skip').attributes('href')).toBe('#main')
    expect(wrapper.find('nav').text()).toContain('Заявки')
    expect(wrapper.find('nav').text()).toContain('Аккаунт')

    const toggle = wrapper.find('button[aria-pressed]')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    expect(wrapper.find('button[aria-pressed]').attributes('aria-pressed')).toBe('true')
    expect(document.documentElement.dataset.theme).toBe('dark')

    apiMock.GET.mockImplementation(() =>
      Promise.reject(new ApiError({ status: 401, code: 'unauthenticated' })),
    )
    await wrapper
      .findAll('header button')
      .find((b) => b.text() === 'Выйти')
      ?.trigger('click')
    await flushPromises()
    expect(apiMock.POST).toHaveBeenCalledWith('/api/v1/admin/auth/logout')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('мобильное меню открывается в Drawer', async () => {
    const { wrapper } = await mountAt('/leads')
    await wrapper.find('button[aria-controls="shell-menu"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('dialog').exists()).toBe(true)
    expect(wrapper.find('dialog nav').text()).toContain('Заявки')
  })
})
