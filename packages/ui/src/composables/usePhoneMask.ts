import { computed, type ComputedRef, type Ref } from 'vue'

const MAX_DIGITS = 11

/** Любой ввод/вставка → только цифры с кодом страны: `79991234567`. */
export function normalizePhoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits === '') return ''
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`
  else if (!digits.startsWith('7')) digits = `7${digits}`
  return digits.slice(0, MAX_DIGITS)
}

/** `79991234567` → `+7 (999) 123-45-67` (частичный ввод форматируется по мере набора). */
export function formatPhone(digits: string): string {
  if (!digits) return ''
  const national = digits.slice(1)
  let out = '+7'
  if (national.length > 0) out += ` (${national.slice(0, 3)}`
  if (national.length > 3) out += `) ${national.slice(3, 6)}`
  if (national.length > 6) out += `-${national.slice(6, 8)}`
  if (national.length > 8) out += `-${national.slice(8, 10)}`
  return out
}

/** Полный российский номер: 11 цифр, начинается с 7. */
export function isCompletePhone(digits: string): boolean {
  return /^7\d{10}$/.test(digits)
}

function countDigits(text: string): number {
  return text.replace(/\D/g, '').length
}

/** Позиция курсора сразу после count-й цифры в отформатированной строке. */
function caretAfterDigits(formatted: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted.charAt(i))) {
      seen += 1
      if (seen === count) return i + 1
    }
  }
  return formatted.length
}

export interface PhoneMask {
  display: ComputedRef<string>
  onInput: (event: Event) => void
  onKeydown: (event: KeyboardEvent) => void
  onPaste: (event: ClipboardEvent) => void
}

/**
 * Маска `+7 (___) ___-__-__` для `<input>`. Значение модели — цифры (`79991234567`),
 * в поле — отформатированная строка. Backspace на разделителе удаляет цифру, а не символ маски.
 */
export function usePhoneMask(
  modelValue: Ref<string> | (() => string),
  setValue: (digits: string) => void,
): PhoneMask {
  const read = typeof modelValue === 'function' ? modelValue : () => modelValue.value
  const display = computed(() => formatPhone(normalizePhoneDigits(read())))

  function commit(el: HTMLInputElement, digits: string, digitsBeforeCaret: number): void {
    const formatted = formatPhone(digits)
    el.value = formatted
    const caret = caretAfterDigits(formatted, digitsBeforeCaret)
    el.setSelectionRange(caret, caret)
    setValue(digits)
  }

  function onInput(event: Event): void {
    const el = event.target as HTMLInputElement
    const raw = el.value
    const caret = el.selectionStart ?? raw.length
    const digits = normalizePhoneDigits(raw)
    let before = countDigits(raw.slice(0, caret))
    // Если код страны был подставлен автоматически, он тоже стоит левее курсора.
    const rawDigits = raw.replace(/\D/g, '')
    if (rawDigits !== '' && !rawDigits.startsWith('7') && !rawDigits.startsWith('8')) before += 1
    commit(el, digits, Math.min(before, digits.length))
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Backspace') return
    const el = event.target as HTMLInputElement
    if (el.selectionStart !== el.selectionEnd) return
    const caret = el.selectionStart ?? 0
    if (caret === 0 || /\d/.test(el.value.charAt(caret - 1))) return // цифру удалит браузер
    const digits = normalizePhoneDigits(el.value)
    const before = countDigits(el.value.slice(0, caret))
    event.preventDefault()
    if (before <= 1) {
      commit(el, '', 0)
      return
    }
    commit(el, digits.slice(0, before - 1) + digits.slice(before), before - 1)
  }

  function onPaste(event: ClipboardEvent): void {
    const el = event.target as HTMLInputElement
    const pasted = event.clipboardData?.getData('text') ?? ''
    const normalized = normalizePhoneDigits(pasted)
    event.preventDefault()
    if (normalized.length >= 10 || el.value === '') {
      commit(el, normalized, normalized.length)
      return
    }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    const left = el.value.slice(0, start)
    const right = el.value.slice(end)
    const inserted = pasted.replace(/\D/g, '')
    const digits = normalizePhoneDigits(`${left}${inserted}${right}`)
    commit(el, digits, countDigits(left) + inserted.length)
  }

  return { display, onInput, onKeydown, onPaste }
}
