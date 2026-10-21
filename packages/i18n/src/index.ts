import { createI18n } from 'vue-i18n'

import { ruPluralRule } from './plural'
import ru from './ru.json'

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? Leaves<T[K], `${P}${K}.`>
    : `${P}${K}`
}[keyof T & string]

/** Ключи словаря; опечатка в ключе — ошибка компиляции. */
export type MessageKey = Leaves<typeof ru>

export type MessageArgs = Record<string, unknown> | unknown[]

export const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'ru',
  messages: { ru },
  pluralRules: { ru: ruPluralRule },
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
})

/** Для скриптов: T('lead.form.successTitle', { number: 12 }) или T('key', [a, b]). */
export function T(key: MessageKey, args?: MessageArgs): string {
  if (args === undefined) return i18n.global.t(key)
  return Array.isArray(args) ? i18n.global.t(key, args) : i18n.global.t(key, args)
}

export { ruPluralRule }
export { ru as messages }
