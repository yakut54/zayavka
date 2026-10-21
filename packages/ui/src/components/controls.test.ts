import { fireEvent, screen } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'

import { expectAccessible, renderWithApp } from '../../tests/helpers'
import Checkbox from './Checkbox/Checkbox.vue'
import Field from './Field/Field.vue'
import Input from './Input/Input.vue'
import Link from './Link/Link.vue'
import PasswordInput from './PasswordInput/PasswordInput.vue'
import SearchInput from './SearchInput/SearchInput.vue'
import Select from './Select/Select.vue'
import Textarea from './Textarea/Textarea.vue'

const FieldWithInput = defineComponent({
  components: { Field, Input },
  props: {
    error: { type: String, default: undefined },
    required: Boolean,
    optionalMark: Boolean,
    hint: { type: String, default: undefined },
  },
  template: `
    <Field label="demo.label" :hint="hint" :error="error" :required="required" :optional-mark="optionalMark" v-slot="{ id, describedBy, invalid }">
      <Input :id="id" :aria-describedby="describedBy" :invalid="invalid" autocomplete="off" />
    </Field>`,
})

describe('Field', () => {
  it('связывает подпись с контролом', async () => {
    const { container } = renderWithApp(FieldWithInput)
    const input = screen.getByLabelText('Подпись') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    await expectAccessible(container)
  })

  it('подсказка связана через aria-describedby', () => {
    renderWithApp(FieldWithInput, { props: { hint: 'demo.hint' } })
    const input = screen.getByLabelText('Подпись')
    const hint = screen.getByText('Подсказка к полю')
    expect(input.getAttribute('aria-describedby')).toBe(hint.id)
  })

  it('ошибка выводится в role=alert и помечает контрол невалидным', async () => {
    const { container } = renderWithApp(FieldWithInput, {
      props: { error: 'errors.field.required' },
    })
    const input = screen.getByLabelText('Подпись')
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('Заполните это поле')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain(alert.id)
    await expectAccessible(container)
  })

  it('без ошибки нет role=alert и aria-invalid', () => {
    renderWithApp(FieldWithInput)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Подпись').getAttribute('aria-invalid')).toBeNull()
  })

  it('обязательное поле: звёздочка скрыта, слово «обязательно» для скринридера', () => {
    const { container } = renderWithApp(FieldWithInput, { props: { required: true } })
    expect(container.textContent).toContain('обязательно')
    expect(container.querySelector('.ui-field__required')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('необязательная отметка', () => {
    const { container } = renderWithApp(FieldWithInput, { props: { optionalMark: true } })
    expect(container.textContent).toContain('(необязательно)')
  })
})

describe('Input', () => {
  it('v-model и атрибуты на нативном input', async () => {
    const { emitted } = renderWithApp(Input, {
      props: {
        modelValue: 'a',
        autocomplete: 'name',
        name: 'name',
        maxlength: 10,
        inputmode: 'text',
      },
      attrs: { id: 'x', 'data-testid': 'native' },
    })
    const input = screen.getByTestId('native') as HTMLInputElement
    expect(input.id).toBe('x')
    expect(input.getAttribute('autocomplete')).toBe('name')
    expect(input.getAttribute('maxlength')).toBe('10')
    expect(input.value).toBe('a')
    await fireEvent.update(input, 'abc')
    expect(emitted()['update:modelValue']).toEqual([['abc']])
  })

  it('placeholder переводится из словаря', () => {
    renderWithApp(Input, { props: { autocomplete: 'off', placeholder: 'demo.placeholder' } })
    expect((screen.getByRole('textbox') as HTMLInputElement).placeholder).toBe('Введите значение')
  })

  it('invalid, disabled, readonly', () => {
    renderWithApp(Input, {
      props: { autocomplete: 'off', invalid: true, disabled: true, readonly: true },
    })
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.disabled).toBe(true)
    expect(input.readOnly).toBe(true)
  })

  it('class и style попадают на корень, а не на input', () => {
    const { container } = renderWithApp(Input, {
      props: { autocomplete: 'off' },
      attrs: { class: 'custom', style: 'width: 10px' },
    })
    expect(container.firstElementChild?.classList).toContain('custom')
    expect(screen.getByRole('textbox').classList).not.toContain('custom')
  })

  it('clearable: кнопка очистки возвращает фокус и сбрасывает значение', async () => {
    const { emitted } = renderWithApp(Input, {
      props: { autocomplete: 'off', modelValue: 'текст', clearable: true },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Очистить поиск' }))
    expect(emitted()['update:modelValue']).toEqual([['']])
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
  })

  it('clearable: кнопки нет для пустого, disabled и readonly', () => {
    const a = renderWithApp(Input, { props: { autocomplete: 'off', clearable: true } })
    expect(a.queryByRole('button')).toBeNull()
    const b = renderWithApp(Input, {
      props: { autocomplete: 'off', clearable: true, modelValue: 'x', disabled: true },
    })
    expect(b.queryByRole('button')).toBeNull()
  })

  it('иконка-префикс', () => {
    const { container } = renderWithApp(Input, {
      props: { autocomplete: 'off', prefixIcon: 'search' },
    })
    expect(container.querySelector('.ui-input__prefix')).not.toBeNull()
  })

  it('эмитит focus и blur', async () => {
    const { emitted } = renderWithApp(Input, { props: { autocomplete: 'off' } })
    const input = screen.getByRole('textbox')
    await fireEvent.focus(input)
    await fireEvent.blur(input)
    expect(emitted().focus).toHaveLength(1)
    expect(emitted().blur).toHaveLength(1)
  })

  it('доступен вместе с подписью', async () => {
    const { container } = renderWithApp(FieldWithInput)
    await expectAccessible(container)
  })
})

describe('PasswordInput', () => {
  it('переключает видимость, aria-pressed и подпись кнопки', async () => {
    renderWithApp(PasswordInput, {
      props: { autocomplete: 'current-password', modelValue: 'secret' },
      attrs: { 'data-testid': 'pwd' },
    })
    const input = screen.getByTestId('pwd') as HTMLInputElement
    expect(input.type).toBe('password')
    const toggle = screen.getByRole('button', { name: 'Показать пароль' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await fireEvent.click(toggle)
    expect(input.type).toBe('text')
    const hide = screen.getByRole('button', { name: 'Скрыть пароль' })
    expect(hide.getAttribute('aria-pressed')).toBe('true')
    await fireEvent.click(hide)
    expect(input.type).toBe('password')
  })

  it('эмитит update:modelValue и blur, передаёт autocomplete', async () => {
    const { emitted } = renderWithApp(PasswordInput, {
      props: { autocomplete: 'new-password' },
      attrs: { 'data-testid': 'pwd' },
    })
    const input = screen.getByTestId('pwd')
    expect(input.getAttribute('autocomplete')).toBe('new-password')
    await fireEvent.update(input, 'abc')
    await fireEvent.blur(input)
    expect(emitted()['update:modelValue']).toEqual([['abc']])
    expect(emitted().blur).toHaveLength(1)
  })
})

describe('Textarea', () => {
  it('v-model, счётчик символов и тон warning у лимита', async () => {
    const { container, emitted, rerender } = renderWithApp(Textarea, {
      props: { modelValue: 'abc', maxlength: 100 },
    })
    expect(container.textContent).toContain('3 / 100')
    expect(container.querySelector('.ui-text--tone-muted')).not.toBeNull()
    await rerender({ modelValue: 'x'.repeat(90), maxlength: 100 })
    expect(container.querySelector('.ui-text--tone-warning')).not.toBeNull()
    await fireEvent.update(screen.getByRole('textbox'), 'новое')
    expect(emitted()['update:modelValue']).toEqual([['новое']])
  })

  it('без maxlength счётчика нет', () => {
    const { container } = renderWithApp(Textarea)
    expect(container.querySelector('.ui-textarea__counter')).toBeNull()
  })

  it('Ctrl/Cmd+Enter отправляет', async () => {
    const { emitted } = renderWithApp(Textarea)
    const area = screen.getByRole('textbox')
    await fireEvent.keyDown(area, { key: 'Enter', ctrlKey: true })
    await fireEvent.keyDown(area, { key: 'Enter', metaKey: true })
    await fireEvent.keyDown(area, { key: 'Enter' })
    expect(emitted().submit).toHaveLength(2)
  })

  it('autoresize подстраивает высоту', async () => {
    renderWithApp(Textarea, { props: { autoresize: true, modelValue: 'a' } })
    const area = screen.getByRole('textbox') as HTMLTextAreaElement
    Object.defineProperty(area, 'scrollHeight', { value: 120, configurable: true })
    await fireEvent.update(area, 'a\nb\nc')
    expect(area.style.height).toBe('120px')
  })

  it('атрибуты: invalid, placeholder, name, class на корне', () => {
    const { container } = renderWithApp(Textarea, {
      props: { invalid: true, placeholder: 'demo.placeholder', name: 'message' },
      attrs: { class: 'custom' },
    })
    const area = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(area.getAttribute('aria-invalid')).toBe('true')
    expect(area.placeholder).toBe('Введите значение')
    expect(area.name).toBe('message')
    expect(container.firstElementChild?.classList).toContain('custom')
  })

  it('эмитит blur', async () => {
    const { emitted } = renderWithApp(Textarea)
    await fireEvent.blur(screen.getByRole('textbox'))
    expect(emitted().blur).toHaveLength(1)
  })
})

describe('Select', () => {
  const options = [
    { value: 'a', label: 'demo.option1' },
    { value: 'b', label: 'demo.option2' },
  ] as const

  it('рисует опции с переводом и выбранное значение', () => {
    renderWithApp(Select, { props: { options: [...options], modelValue: 'b' } })
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual([
      'Первый вариант',
      'Второй вариант',
    ])
    expect(select.value).toBe('b')
  })

  it('placeholder — пустой пункт', () => {
    renderWithApp(Select, { props: { options: [...options], placeholder: 'demo.placeholder' } })
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.options[0]?.value).toBe('')
    expect(select.options[0]?.textContent?.trim()).toBe('Введите значение')
  })

  it('эмитит update:modelValue и blur', async () => {
    const { emitted } = renderWithApp(Select, { props: { options: [...options] } })
    const select = screen.getByRole('combobox')
    await fireEvent.update(select, 'b')
    await fireEvent.blur(select)
    expect(emitted()['update:modelValue']).toEqual([['b']])
    expect(emitted().blur).toHaveLength(1)
  })

  it('если родитель не принял значение, select возвращается к текущему', async () => {
    renderWithApp(Select, { props: { options: [...options], modelValue: 'a' } })
    const select = screen.getByRole('combobox') as HTMLSelectElement
    await fireEvent.update(select, 'b')
    await nextTick()
    expect(select.value).toBe('a')
  })

  it('invalid и disabled; атрибуты на select', async () => {
    const { container } = renderWithApp(Select, {
      props: { options: [...options], invalid: true, disabled: true, name: 'service' },
      attrs: { 'aria-label': 'Выбор', class: 'custom' },
    })
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.getAttribute('aria-invalid')).toBe('true')
    expect(select.disabled).toBe(true)
    expect(select.name).toBe('service')
    expect(container.firstElementChild?.classList).toContain('custom')
    await expectAccessible(container)
  })
})

describe('Checkbox', () => {
  it('по умолчанию не отмечен', () => {
    renderWithApp(Checkbox, { slots: { default: 'Согласен' } })
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  })

  it('переключается и эмитит значение', async () => {
    const { emitted } = renderWithApp(Checkbox, { slots: { default: 'Согласен' } })
    await fireEvent.click(screen.getByRole('checkbox'))
    expect(emitted()['update:modelValue']).toEqual([[true]])
  })

  it('кнопка ярлыка тоже переключает', async () => {
    const { emitted } = renderWithApp(Checkbox, { slots: { default: 'Согласен' } })
    await fireEvent.click(screen.getByText('Согласен'))
    expect(emitted()['update:modelValue']).toEqual([[true]])
  })

  it('в подписи можно разместить ссылки', async () => {
    const { container } = renderWithApp(Checkbox, {
      slots: {
        default: { components: { Link }, template: '<Link k="demo.policyLink" href="/privacy" />' },
      },
    })
    expect(screen.getByRole('link', { name: 'политикой' })).toBeTruthy()
    await expectAccessible(container)
  })

  it('disabled, invalid, blur и атрибуты на input', async () => {
    const { emitted } = renderWithApp(Checkbox, {
      props: { disabled: true, invalid: true, name: 'consent', modelValue: true },
      attrs: { id: 'consent-box' },
      slots: { default: 'Согласен' },
    })
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.id).toBe('consent-box')
    expect(box.disabled).toBe(true)
    expect(box.checked).toBe(true)
    expect(box.getAttribute('aria-invalid')).toBe('true')
    await fireEvent.blur(box)
    expect(emitted().blur).toHaveLength(1)
  })
})

describe('SearchInput', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('эмитит значение после debounce', async () => {
    const { emitted } = renderWithApp(SearchInput, { props: { debounceMs: 300 } })
    const input = screen.getByRole('searchbox')
    await fireEvent.update(input, 'ив')
    await fireEvent.update(input, 'иван')
    expect(emitted()['update:modelValue']).toBeUndefined()
    vi.advanceTimersByTime(300)
    expect(emitted()['update:modelValue']).toEqual([['иван']])
  })

  it('по умолчанию debounce 300 мс', async () => {
    const { emitted } = renderWithApp(SearchInput)
    await fireEvent.update(screen.getByRole('searchbox'), 'a')
    vi.advanceTimersByTime(299)
    expect(emitted()['update:modelValue']).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(emitted()['update:modelValue']).toHaveLength(1)
  })

  it('Enter отправляет сразу', async () => {
    const { emitted } = renderWithApp(SearchInput)
    const input = screen.getByRole('searchbox')
    await fireEvent.update(input, 'иван')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(emitted()['update:modelValue']).toEqual([['иван']])
  })

  it('очистка отправляется сразу и отменяет отложенное значение', async () => {
    const { emitted } = renderWithApp(SearchInput, { props: { modelValue: 'иван' } })
    const input = screen.getByRole('searchbox')
    await fireEvent.update(input, 'ива')
    await fireEvent.update(input, '')
    expect(emitted()['update:modelValue']).toEqual([['']])
    vi.advanceTimersByTime(1000)
    expect(emitted()['update:modelValue']).toEqual([['']])
  })

  it('внешнее изменение значения (сброс фильтров) обновляет поле', async () => {
    const { rerender } = renderWithApp(SearchInput, { props: { modelValue: 'иван' } })
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('иван')
    await rerender({ modelValue: '' })
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('')
  })

  it('имеет иконку поиска, кнопку очистки и autocomplete=off', async () => {
    vi.useRealTimers() // axe использует таймеры
    const { container } = renderWithApp(SearchInput, {
      props: { modelValue: 'x', placeholder: 'demo.placeholder' },
      attrs: { 'aria-label': 'Поиск' },
    })
    expect(screen.getByRole('searchbox').getAttribute('autocomplete')).toBe('off')
    expect(screen.getByRole('button', { name: 'Очистить поиск' })).toBeTruthy()
    await expectAccessible(container)
  })

  it('держит локальное значение при незавершённом debounce', async () => {
    renderWithApp(SearchInput)
    const input = screen.getByRole('searchbox') as HTMLInputElement
    await fireEvent.update(input, 'аб')
    expect(input.value).toBe('аб')
  })
})

describe('v-model интеграция', () => {
  it('Input внутри компонента с ref', async () => {
    const Host = defineComponent({
      components: { Input },
      setup: () => ({ value: ref('') }),
      template: `<div><Input v-model="value" autocomplete="off" /><output>{{ value }}</output></div>`,
    })
    const { container } = renderWithApp(Host)
    await fireEvent.update(screen.getByRole('textbox'), 'привет')
    expect(container.querySelector('output')?.textContent).toBe('привет')
  })
})
