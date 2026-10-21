import { formatPhone } from '@app/ui'

import { adminConfig } from '../admin.config'

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: adminConfig.timezone,
})

/** `20.10.2026, 15:15` в часовом поясе бизнеса. */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

/** `+79991234567` → `+7 (999) 123-45-67`. Иностранные номера показываются как есть. */
export function displayPhone(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('7') ? formatPhone(digits) : phoneE164
}
