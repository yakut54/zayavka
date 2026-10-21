import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { z } from 'zod'

import { errorKey, useForm } from './useForm'

const schema = z.object({
  name: z.string().trim().min(2, 'too_short'),
  phone: z.string().regex(/^7\d{10}$/, 'phone_invalid'),
  serviceSlug: z.string(),
  consent: z.boolean().refine((value) => value, 'consent_required'),
})

const initial = { name: '', phone: '', serviceSlug: '', consent: false }

function make(onSubmit = vi.fn(), extra: { onError?: (e: unknown) => void } = {}) {
  return useForm({ schema, initial, onSubmit, ...extra })
}

function fill(form: ReturnType<typeof make>): void {
  form.values.name = 'Иван'
  form.values.phone = '79991234567'
  form.values.consent = true
}

describe('useForm: показ ошибок', () => {
  it('до взаимодействия ошибок нет', () => {
    const form = make()
    expect(form.errors.value.name).toBeUndefined()
    expect(form.field('name').invalid).toBe(false)
    expect(form.errorList.value).toEqual([])
  })

  it('ошибка поля появляется после blur', () => {
    const form = make()
    form.field('name').onBlur()
    expect(form.errors.value.name).toBe('errors.field.too_short')
    expect(form.field('name').invalid).toBe(true)
    expect(form.errors.value.phone).toBeUndefined()
  })

  it('ошибка исчезает, когда значение исправлено', () => {
    const form = make()
    form.field('name').onBlur()
    form.field('name')['onUpdate:modelValue']('Иван')
    expect(form.errors.value.name).toBeUndefined()
  })

  it('field() даёт modelValue, имя и обработчики', () => {
    const form = make()
    const field = form.field('phone')
    expect(field.name).toBe('phone')
    expect(field.modelValue).toBe('')
    field['onUpdate:modelValue']('79990000000')
    expect(form.values.phone).toBe('79990000000')
  })

  it('неизвестный код превращается в invalid_format', () => {
    expect(errorKey('что-то')).toBe('errors.field.invalid_format')
    expect(errorKey('required')).toBe('errors.field.required')
  })

  it('стандартное сообщение zod без кода → invalid_format', () => {
    const form = useForm({
      schema: z.object({ age: z.number() }),
      initial: { age: 'x' as never },
      onSubmit: vi.fn(),
    })
    form.field('age').onBlur()
    expect(form.errors.value.age).toBe('errors.field.invalid_format')
  })
})

describe('useForm: отправка', () => {
  it('с ошибками не вызывает onSubmit, показывает все ошибки и список', async () => {
    const onSubmit = vi.fn()
    const form = make(onSubmit)
    await form.handleSubmit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(form.submitCount.value).toBe(1)
    expect(form.errors.value).toMatchObject({
      name: 'errors.field.too_short',
      phone: 'errors.field.phone_invalid',
      consent: 'errors.field.consent_required',
    })
    expect(form.errorList.value.map((e) => e.name)).toEqual(['name', 'phone', 'consent'])
  })

  it('фокусирует первое невалидное поле по порядку в DOM', async () => {
    document.body.innerHTML = `<form id="f"><input name="name"><input name="phone"><input name="consent" type="checkbox"></form>`
    const formEl = document.getElementById('f') as HTMLFormElement
    const form = make()
    form.values.name = 'Иван'
    const event = new Event('submit', { cancelable: true })
    Object.defineProperty(event, 'currentTarget', { value: formEl })
    await form.handleSubmit(event)
    expect(document.activeElement).toBe(formEl.elements.namedItem('phone'))
    expect(event.defaultPrevented).toBe(true)
  })

  it('фокус находит поле и без формы', async () => {
    document.body.innerHTML = `<input name="name">`
    const form = make()
    await form.handleSubmit()
    expect((document.activeElement as HTMLInputElement).name).toBe('name')
  })

  it('focusField фокусирует поле по имени', () => {
    document.body.innerHTML = `<input name="phone">`
    make().focusField('phone')
    expect((document.activeElement as HTMLInputElement).name).toBe('phone')
  })

  it('валидная форма вызывает onSubmit с разобранными значениями', async () => {
    const onSubmit = vi.fn()
    const form = make(onSubmit)
    form.values.name = '  Иван  '
    form.values.phone = '79991234567'
    form.values.consent = true
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Иван',
      phone: '79991234567',
      serviceSlug: '',
      consent: true,
    })
    expect(form.isSubmitting.value).toBe(false)
  })

  it('двойная отправка невозможна', async () => {
    let release: () => void = () => undefined
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const form = make(onSubmit)
    fill(form)
    const first = form.handleSubmit()
    await nextTick()
    expect(form.isSubmitting.value).toBe(true)
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalledTimes(1)
    release()
    await first
    expect(form.isSubmitting.value).toBe(false)
  })

  it('ошибка onSubmit передаётся в onError', async () => {
    const boom = new Error('boom')
    const onError = vi.fn()
    const form = make(vi.fn().mockRejectedValue(boom), { onError })
    fill(form)
    await form.handleSubmit()
    expect(onError).toHaveBeenCalledWith(boom)
    expect(form.isSubmitting.value).toBe(false)
  })

  it('без onError ошибка пробрасывается', async () => {
    const form = make(vi.fn().mockRejectedValue(new Error('boom')))
    fill(form)
    await expect(form.handleSubmit()).rejects.toThrow('boom')
    expect(form.isSubmitting.value).toBe(false)
  })
})

describe('useForm: ошибки сервера', () => {
  it('раскладывает по полям, snake_case → camelCase', async () => {
    const form = make()
    fill(form)
    await nextTick()
    const unmatched = form.setServerErrors([
      { field: 'phone', code: 'phone_invalid' },
      { field: 'service_slug', code: 'unknown_service' },
      { field: 'captcha_token', code: 'invalid_format' },
    ])
    expect(unmatched).toEqual([{ field: 'captcha_token', code: 'invalid_format' }])
    await form.handleSubmit()
    expect(form.errors.value.phone).toBe('errors.field.phone_invalid')
    expect(form.errors.value.serviceSlug).toBe('errors.field.unknown_service')
  })

  it('не даёт отправить форму, пока серверная ошибка не исправлена', async () => {
    const onSubmit = vi.fn()
    const form = make(onSubmit)
    fill(form)
    form.setServerErrors([{ field: 'phone', code: 'phone_invalid' }])
    await form.handleSubmit()
    expect(onSubmit).not.toHaveBeenCalled()
    form.values.phone = '79990000000'
    await nextTick()
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('серверная ошибка поля сбрасывается при его изменении', async () => {
    const form = make()
    fill(form)
    form.touched.phone = true
    form.setServerErrors([{ field: 'phone', code: 'phone_invalid' }])
    expect(form.errors.value.phone).toBe('errors.field.phone_invalid')
    form.values.phone = '79990000001'
    await nextTick()
    expect(form.errors.value.phone).toBeUndefined()
  })
})

describe('useForm: reset', () => {
  it('возвращает значения и сбрасывает состояние', async () => {
    const form = make()
    fill(form)
    form.setServerErrors([{ field: 'phone', code: 'phone_invalid' }])
    await form.handleSubmit()
    form.reset()
    expect(form.values).toEqual(initial)
    expect(form.submitCount.value).toBe(0)
    expect(form.errors.value.name).toBeUndefined()
    expect(form.touched).toEqual({})
  })
})
