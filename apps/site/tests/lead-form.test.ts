import { i18n } from '@app/i18n'
import { createHead } from '@unhead/vue/client'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { selectedService } from '../src/composables/useLeadFormBus'
import { submitLead } from '../src/features/lead-form/api'
import type * as ApiModule from '../src/features/lead-form/api'
import type { SubmitResult } from '../src/features/lead-form/api'
import LeadForm from '../src/features/lead-form/LeadForm.vue'
import { createTestRouter, expectAccessible } from './helpers'

vi.mock('../src/features/lead-form/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  submitLead: vi.fn(),
}))

const submit = vi.mocked(submitLead)

async function mountForm() {
  const router = createTestRouter()
  await router.push('/')
  const wrapper = mount(LeadForm, {
    attachTo: document.body,
    global: { plugins: [router, createHead(), i18n] },
  })
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountForm>>

const field = (wrapper: Wrapper, name: string) => wrapper.find<HTMLInputElement>(`[name="${name}"]`)

async function fillValid(wrapper: Wrapper): Promise<void> {
  await field(wrapper, 'name').setValue('Иван Петров')
  await field(wrapper, 'phone').setValue('9991234567')
  await field(wrapper, 'consent').setValue(true)
}

async function send(wrapper: Wrapper): Promise<void> {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  submit.mockReset()
  selectedService.value = ''
})
afterEach(() => vi.useRealTimers())

describe('LeadForm: исходное состояние', () => {
  it('чекбокс согласия не отмечен, ссылки на политику и согласие внутри подписи', async () => {
    const wrapper = await mountForm()
    expect((field(wrapper, 'consent').element as HTMLInputElement).checked).toBe(false)
    const label = wrapper.find('label.ui-checkbox')
    expect(label.find('a[href="/privacy"]').exists()).toBe(true)
    expect(label.find('a[href="/consent"]').exists()).toBe(true)
  })

  it('поля имеют правильные autocomplete и обязательность', async () => {
    const wrapper = await mountForm()
    expect(field(wrapper, 'name').attributes('autocomplete')).toBe('name')
    expect(field(wrapper, 'phone').attributes('autocomplete')).toBe('tel')
    expect(field(wrapper, 'email').attributes('autocomplete')).toBe('email')
    expect(field(wrapper, 'email').attributes('type')).toBe('email')
    expect(wrapper.text()).toContain('(необязательно)')
  })

  it('селект услуг: опция по умолчанию и все услуги', async () => {
    const wrapper = await mountForm()
    const options = wrapper.findAll('select[name="serviceSlug"] option').map((o) => o.text())
    expect(options).toEqual([
      'Не знаю, нужна консультация',
      'Компьютерная диагностика',
      'Техобслуживание',
      'Ремонт тормозов',
      'Шиномонтаж',
    ])
  })

  it('счётчик символов сообщения', async () => {
    const wrapper = await mountForm()
    await field(wrapper, 'message').setValue('привет')
    expect(wrapper.text()).toContain('6 / 2000')
  })

  it('доступна', async () => {
    const wrapper = await mountForm()
    await expectAccessible(wrapper.element)
  })
})

describe('LeadForm: валидация', () => {
  it('пустая отправка: ошибки, Alert со ссылками, фокус на «Имя», запрос не уходит', async () => {
    const wrapper = await mountForm()
    await send(wrapper)
    expect(submit).not.toHaveBeenCalled()
    const alert = wrapper.find('[role="alert"].ui-alert')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Проверьте поля формы')
    const links = alert.findAll('a')
    expect(links.map((a) => a.text())).toEqual([
      'Как к вам обращаться',
      'Телефон',
      'Согласие на обработку данных',
    ])
    expect(document.activeElement).toBe(field(wrapper, 'name').element)
    expect(field(wrapper, 'name').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Нужно согласие на обработку данных')
    await expectAccessible(wrapper.element)
  })

  it('ссылка в Alert переводит фокус на поле', async () => {
    const wrapper = await mountForm()
    await send(wrapper)
    await wrapper.find('[role="alert"].ui-alert a[href="#phone"]').trigger('click')
    expect(document.activeElement).toBe(field(wrapper, 'phone').element)
  })

  it('ошибка поля показывается после blur', async () => {
    const wrapper = await mountForm()
    await field(wrapper, 'name').setValue('И')
    expect(wrapper.text()).not.toContain('Слишком коротко')
    await field(wrapper, 'name').trigger('blur')
    expect(wrapper.text()).toContain('Слишком коротко')
  })

  it('без согласия заявка не уходит', async () => {
    const wrapper = await mountForm()
    await field(wrapper, 'name').setValue('Иван')
    await field(wrapper, 'phone').setValue('9991234567')
    await send(wrapper)
    expect(submit).not.toHaveBeenCalled()
    expect(wrapper.find('#consent-error').text()).toContain('Нужно согласие')
  })

  it('маска телефона хранит цифры, в запрос уходит +7…', async () => {
    submit.mockResolvedValue({ kind: 'ok', number: 7 })
    const wrapper = await mountForm()
    await fillValid(wrapper)
    expect((field(wrapper, 'phone').element as HTMLInputElement).value).toBe('+7 (999) 123-45-67')
    await send(wrapper)
    expect(submit.mock.calls[0]?.[0].phone).toBe('+79991234567')
  })
})

describe('LeadForm: отправка', () => {
  it('успех: панель с номером, фокус на заголовке, кнопка «Отправить ещё одну»', async () => {
    submit.mockResolvedValue({ kind: 'ok', number: 123 })
    const wrapper = await mountForm()
    await fillValid(wrapper)
    await send(wrapper)
    expect(wrapper.find('form').exists()).toBe(false)
    const heading = wrapper.find('h3')
    expect(heading.text()).toBe('Заявка № 123 принята')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(heading.element)
    expect(wrapper.text()).toContain('Перезвоним в течение 15 минут в рабочее время')

    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)
    expect((field(wrapper, 'name').element as HTMLInputElement).value).toBe('')
    expect((field(wrapper, 'consent').element as HTMLInputElement).checked).toBe(false)
  })

  it('payload: версия политики, honeypot, elapsed_ms, согласие', async () => {
    submit.mockResolvedValue({ kind: 'ok', number: 1 })
    const wrapper = await mountForm()
    await fillValid(wrapper)
    await field(wrapper, 'website').setValue('http://spam')
    await send(wrapper)
    const payload = submit.mock.calls[0]?.[0]
    expect(payload).toMatchObject({
      name: 'Иван Петров',
      consent: true,
      policy_version: '2026-10-20',
      website: 'http://spam',
      email: null,
      message: null,
      service_slug: null,
    })
    expect(typeof payload?.elapsed_ms).toBe('number')
  })

  it('во время отправки кнопка в loading и повторный клик не уходит', async () => {
    let resolve: (value: SubmitResult) => void = () => undefined
    submit.mockReturnValue(new Promise((r) => (resolve = r)))
    const wrapper = await mountForm()
    await fillValid(wrapper)
    await send(wrapper)
    const button = wrapper.find('button[type="submit"]')
    expect(button.attributes('aria-busy')).toBe('true')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(field(wrapper, 'name').attributes('readonly')).toBeDefined()
    await send(wrapper)
    expect(submit).toHaveBeenCalledTimes(1)
    resolve({ kind: 'ok', number: 2 })
    await flushPromises()
  })

  it('ошибки сервера (422) раскладываются по полям, фокус на первом', async () => {
    submit.mockResolvedValue({
      kind: 'validation',
      errors: [
        { field: 'phone', code: 'phone_invalid' },
        { field: 'service_slug', code: 'unknown_service' },
      ],
    })
    const wrapper = await mountForm()
    await fillValid(wrapper)
    await send(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('Проверьте номер телефона')
    expect(wrapper.text()).toContain('Выберите услугу из списка')
    expect(field(wrapper, 'phone').attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field(wrapper, 'phone').element)
  })

  it('выбранная в карточке услуга предвыбирается в Select', async () => {
    const wrapper = await mountForm()
    selectedService.value = 'brakes'
    await flushPromises()
    expect((field(wrapper, 'serviceSlug').element as unknown as HTMLSelectElement).value).toBe(
      'brakes',
    )
  })

  it('услуга, выбранная до монтирования формы, подхватывается при монтировании', async () => {
    selectedService.value = 'tires'
    const wrapper = await mountForm()
    expect((field(wrapper, 'serviceSlug').element as unknown as HTMLSelectElement).value).toBe(
      'tires',
    )
  })
})

describe('LeadForm: ошибки отправки', () => {
  it('429: предупреждение с минутами, кнопка заблокирована до истечения времени', async () => {
    vi.useFakeTimers()
    submit.mockResolvedValue({ kind: 'rate-limited', retryAfterSeconds: 240 })
    const wrapper = await mountForm()
    await fillValid(wrapper)
    await send(wrapper)
    const alert = wrapper.find('.ui-alert--warning')
    expect(alert.text()).toContain('Попробуйте через 4 мин.')
    const button = wrapper.find('button[type="submit"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)

    await vi.advanceTimersByTimeAsync(241_000)
    await flushPromises()
    expect(wrapper.find('.ui-alert--warning').exists()).toBe(false)
    expect((wrapper.find('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('сеть: сообщение, данные сохранены, «Повторить» отправляет снова', async () => {
    submit
      .mockResolvedValueOnce({ kind: 'network' })
      .mockResolvedValueOnce({ kind: 'ok', number: 5 })
    const wrapper = await mountForm()
    await fillValid(wrapper)
    await send(wrapper)
    expect(wrapper.find('.ui-alert--danger').text()).toContain('Нет соединения с сервером')
    expect((field(wrapper, 'name').element as HTMLInputElement).value).toBe('Иван Петров')
    const retry = wrapper.findAll('button').find((b) => b.text() === 'Повторить')
    await retry?.trigger('click')
    await flushPromises()
    expect(submit).toHaveBeenCalledTimes(2)
    expect(wrapper.find('h3').text()).toBe('Заявка № 5 принята')
  })

  it('500: сообщение и ссылка «Позвонить напрямую»', async () => {
    submit.mockResolvedValue({ kind: 'server-error' })
    const wrapper = await mountForm()
    await fillValid(wrapper)
    await send(wrapper)
    const alert = wrapper.find('.ui-alert--danger')
    expect(alert.text()).toContain('Что-то пошло не так')
    const link = alert.find('a')
    expect(link.text()).toBe('Позвонить напрямую')
    expect(link.attributes('href')).toBe('tel:+70000000000')
  })
})
