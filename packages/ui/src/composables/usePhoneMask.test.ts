import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { defineComponent, ref } from 'vue'

import PhoneInput from '../components/PhoneInput/PhoneInput.vue'
import { formatPhone, isCompletePhone, normalizePhoneDigits } from './usePhoneMask'

describe('normalizePhoneDigits', () => {
  it.each([
    ['', ''],
    ['abc', ''],
    ['8', '7'],
    ['7', '7'],
    ['9', '79'],
    ['89991234567', '79991234567'],
    ['+7 999 123-45-67', '79991234567'],
    ['9991234567', '79991234567'],
    ['+7 (999) 123-45-67', '79991234567'],
    ['8 (999) 123 45 67', '79991234567'],
    ['8-999-123-45-67', '79991234567'],
    ['(999)123-45-67', '79991234567'],
    ['7 999 123 45 67', '79991234567'],
    ['+79991234567', '79991234567'],
    ['899912345678901', '79991234567'], // обрезается до 11 цифр
    ['  +7 999  ', '7999'],
  ])('%j → %j', (raw, expected) => {
    expect(normalizePhoneDigits(raw)).toBe(expected)
  })
})

describe('formatPhone', () => {
  it.each([
    ['', ''],
    ['7', '+7'],
    ['79', '+7 (9'],
    ['7999', '+7 (999'],
    ['79991', '+7 (999) 1'],
    ['7999123', '+7 (999) 123'],
    ['79991234', '+7 (999) 123-4'],
    ['799912345', '+7 (999) 123-45'],
    ['7999123456', '+7 (999) 123-45-6'],
    ['79991234567', '+7 (999) 123-45-67'],
  ])('%j → %j', (digits, expected) => {
    expect(formatPhone(digits)).toBe(expected)
  })
})

describe('isCompletePhone', () => {
  it.each([
    ['79991234567', true],
    ['7999123456', false],
    ['89991234567', false],
    ['', false],
  ])('%j → %s', (digits, expected) => {
    expect(isCompletePhone(digits)).toBe(expected)
  })
})

const Host = defineComponent({
  components: { PhoneInput },
  props: { initial: { type: String, default: '' } },
  setup(props) {
    const value = ref(props.initial)
    return { value }
  },
  template: `<div><PhoneInput v-model="value" name="phone" /><output data-testid="digits">{{ value }}</output></div>`,
})

function setup(initial = '') {
  render(Host, { props: { initial } })
  const input = screen.getByRole('textbox') as HTMLInputElement
  const digits = () => screen.getByTestId('digits').textContent
  return { input, digits }
}

async function type(input: HTMLInputElement, text: string): Promise<void> {
  for (const char of text) {
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    input.value = input.value.slice(0, start) + char + input.value.slice(end)
    input.setSelectionRange(start + 1, start + 1)
    await fireEvent.input(input)
  }
}

async function paste(input: HTMLInputElement, text: string): Promise<void> {
  await fireEvent.paste(input, { clipboardData: { getData: () => text } })
}

describe('PhoneInput: ввод', () => {
  it('набор по одной цифре форматируется маской', async () => {
    const { input, digits } = setup()
    await type(input, '9991234567')
    expect(input.value).toBe('+7 (999) 123-45-67')
    expect(digits()).toBe('79991234567')
  })

  it('ввод с 8 заменяется на +7', async () => {
    const { input, digits } = setup()
    await type(input, '89991234567')
    expect(input.value).toBe('+7 (999) 123-45-67')
    expect(digits()).toBe('79991234567')
  })

  it('ввод с 7 не дублируется', async () => {
    const { input } = setup()
    await type(input, '79991234567')
    expect(input.value).toBe('+7 (999) 123-45-67')
  })

  it('нецифровые символы игнорируются', async () => {
    const { input, digits } = setup()
    await type(input, '9a9b9')
    expect(input.value).toBe('+7 (999')
    expect(digits()).toBe('7999')
  })

  it('больше 11 цифр не вводится', async () => {
    const { input, digits } = setup()
    await type(input, '99912345678999')
    expect(digits()).toBe('79991234567')
  })

  it('v-model: начальное значение отображается с маской', () => {
    const { input } = setup('79991234567')
    expect(input.value).toBe('+7 (999) 123-45-67')
  })

  it('имеет inputmode=tel, autocomplete=tel и placeholder', () => {
    const { input } = setup()
    expect(input.getAttribute('inputmode')).toBe('tel')
    expect(input.getAttribute('autocomplete')).toBe('tel')
    expect(input.getAttribute('name')).toBe('phone')
    expect(input.placeholder).toBe('+7 (___) ___-__-__')
  })
})

describe('PhoneInput: вставка', () => {
  it.each([
    ['89991234567'],
    ['+7 999 123-45-67'],
    ['9991234567'],
    ['+7 (999) 123-45-67'],
    ['8 999 123 45 67'],
    ['7-999-123-45-67'],
  ])('вставка %j нормализуется', async (text) => {
    const { input, digits } = setup()
    await paste(input, text)
    expect(input.value).toBe('+7 (999) 123-45-67')
    expect(digits()).toBe('79991234567')
  })

  it('полный номер заменяет частично введённый', async () => {
    const { input, digits } = setup()
    await type(input, '912')
    await paste(input, '+7 999 123-45-67')
    expect(digits()).toBe('79991234567')
  })

  it('короткий фрагмент вставляется в позицию курсора', async () => {
    const { input, digits } = setup('7999')
    input.setSelectionRange(input.value.length, input.value.length)
    await paste(input, '12')
    expect(digits()).toBe('799912')
  })
})

describe('PhoneInput: Backspace', () => {
  async function backspace(input: HTMLInputElement): Promise<void> {
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)
    if (!event.defaultPrevented) {
      // браузер удалил бы символ слева от курсора
      const pos = input.selectionStart ?? 0
      if (pos > 0) {
        input.value = input.value.slice(0, pos - 1) + input.value.slice(pos)
        input.setSelectionRange(pos - 1, pos - 1)
        await fireEvent.input(input)
      }
    }
    await Promise.resolve()
  }

  it('на цифре удаляет цифру', async () => {
    const { input, digits } = setup('79991234567')
    input.setSelectionRange(input.value.length, input.value.length)
    await backspace(input)
    expect(digits()).toBe('7999123456')
    expect(input.value).toBe('+7 (999) 123-45-6')
  })

  it('на разделителе удаляет предыдущую цифру, а не символ маски', async () => {
    const { input, digits } = setup('79991234567')
    // курсор сразу после «) » — перед «1»
    const pos = input.value.indexOf('1')
    input.setSelectionRange(pos, pos)
    await backspace(input)
    expect(digits()).toBe('7991234567')
    expect(input.value).toBe('+7 (991) 234-56-7')
  })

  it('удаление последней цифры очищает поле', async () => {
    const { input, digits } = setup('7')
    input.setSelectionRange(input.value.length, input.value.length)
    await backspace(input)
    expect(digits()).toBe('')
    expect(input.value).toBe('')
  })

  it('с выделением не вмешивается', async () => {
    const { input } = setup('79991234567')
    input.setSelectionRange(0, 4)
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('в начале поля ничего не делает', async () => {
    const { input } = setup('79991234567')
    input.setSelectionRange(0, 0)
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('другие клавиши игнорируются', () => {
    const { input } = setup('79991234567')
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
