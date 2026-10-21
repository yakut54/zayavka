import type { MessageKey } from '@app/i18n'
import { computed, reactive, ref, watch } from 'vue'
import type { z } from 'zod'

/** Коды ошибок полей: те же, что отдаёт сервер (раздел 7.3 ТЗ). */
export const FIELD_ERROR_CODES = [
  'required',
  'too_short',
  'too_long',
  'invalid_format',
  'phone_invalid',
  'email_invalid',
  'consent_required',
  'unknown_service',
  'wrong_password',
  'password_mismatch',
] as const

export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number]

export interface ServerFieldError {
  field: string
  code: string
}

export interface FieldBinding<V> {
  name: string
  modelValue: V
  'onUpdate:modelValue': (value: V) => void
  onBlur: () => void
  error: MessageKey | undefined
  invalid: boolean
}

export interface UseFormOptions<S extends z.ZodType> {
  schema: S
  initial: z.input<S>
  onSubmit: (values: z.output<S>) => Promise<void> | void
  /** Ошибка из onSubmit. Без обработчика пробрасывается дальше. */
  onError?: (error: unknown) => void
}

type Values<S extends z.ZodType> = z.input<S> & Record<string, unknown>

const isErrorCode = (code: string): code is FieldErrorCode =>
  (FIELD_ERROR_CODES as readonly string[]).includes(code)

export const errorKey = (code: string): MessageKey =>
  `errors.field.${isErrorCode(code) ? code : 'invalid_format'}` as MessageKey

const snakeToCamel = (name: string): string =>
  name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function useForm<S extends z.ZodType>(options: UseFormOptions<S>) {
  const { schema, onSubmit, onError } = options
  const initial = clone(options.initial)
  const values = reactive(clone(options.initial) as Values<S>)
  const touched = reactive<Record<string, boolean>>({})
  const serverErrors = reactive<Record<string, string>>({})
  const isSubmitting = ref(false)
  const submitCount = ref(0)
  const fieldOrder = Object.keys(initial as object)

  const clientErrors = computed(() => {
    const result: Record<string, string> = {}
    const parsed = schema.safeParse(values)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const name = String(issue.path[0] ?? '')
        if (name && !(name in result)) result[name] = issue.message
      }
    }
    return result
  })

  const hasClientErrors = computed(() => Object.keys(clientErrors.value).length > 0)

  function codeOf(name: string): string | undefined {
    return serverErrors[name] ?? clientErrors.value[name]
  }

  function isVisible(name: string): boolean {
    return Boolean(touched[name]) || submitCount.value > 0
  }

  /** Ошибки, которые уже можно показать пользователю: ключ словаря по имени поля. */
  const errors = computed(() => {
    const result: Record<string, MessageKey | undefined> = {}
    for (const name of fieldOrder) {
      const code = codeOf(name)
      result[name] = code !== undefined && isVisible(name) ? errorKey(code) : undefined
    }
    return result
  })

  /** Список для Alert над формой: только после первой попытки отправки. */
  const errorList = computed(() =>
    submitCount.value === 0
      ? []
      : fieldOrder.flatMap((name) => {
          const key = errors.value[name]
          return key ? [{ name, key }] : []
        }),
  )

  watch(
    () => ({ ...values }),
    (next, previous) => {
      for (const name of Object.keys(next)) {
        if (next[name] !== previous[name]) Reflect.deleteProperty(serverErrors, name)
      }
    },
  )

  function field<K extends keyof z.input<S> & string>(name: K): FieldBinding<z.input<S>[K]> {
    return {
      name,
      modelValue: values[name] as z.input<S>[K],
      'onUpdate:modelValue': (value) => {
        ;(values as Record<string, unknown>)[name] = value
      },
      onBlur: () => {
        touched[name] = true
      },
      error: errors.value[name],
      invalid: errors.value[name] !== undefined,
    }
  }

  function setServerErrors(list: ServerFieldError[]): ServerFieldError[] {
    const unmatched: ServerFieldError[] = []
    for (const item of list) {
      const name = fieldOrder.includes(item.field) ? item.field : snakeToCamel(item.field)
      if (fieldOrder.includes(name)) serverErrors[name] = item.code
      else unmatched.push(item)
    }
    return unmatched
  }

  function focusField(name: string): void {
    const el = document.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`)
    el?.focus()
  }

  function focusFirstInvalid(formEl?: HTMLFormElement | null): void {
    const invalid = new Set(fieldOrder.filter((name) => codeOf(name) !== undefined))
    const controls = formEl ? [...formEl.elements] : []
    const first = controls.find((el) => invalid.has((el as HTMLInputElement).name))
    if (first instanceof HTMLElement) first.focus()
    else {
      const name = fieldOrder.find((n) => invalid.has(n))
      if (name) focusField(name)
    }
  }

  async function handleSubmit(event?: Event): Promise<void> {
    event?.preventDefault()
    if (isSubmitting.value) return
    submitCount.value += 1
    const parsed = schema.safeParse(values)
    if (!parsed.success || Object.keys(serverErrors).length > 0) {
      const formEl = event?.currentTarget instanceof HTMLFormElement ? event.currentTarget : null
      // дождаться отрисовки ошибок и aria-invalid
      await Promise.resolve()
      focusFirstInvalid(formEl)
      return
    }
    isSubmitting.value = true
    try {
      await onSubmit(parsed.data)
    } catch (error) {
      if (!onError) throw error
      onError(error)
    } finally {
      isSubmitting.value = false
    }
  }

  function reset(): void {
    Object.assign(values, clone(initial))
    for (const name of Object.keys(touched)) Reflect.deleteProperty(touched, name)
    for (const name of Object.keys(serverErrors)) Reflect.deleteProperty(serverErrors, name)
    submitCount.value = 0
  }

  return {
    values,
    errors,
    errorList,
    touched,
    isSubmitting,
    submitCount,
    hasClientErrors,
    field,
    setServerErrors,
    focusField,
    handleSubmit,
    reset,
  }
}
