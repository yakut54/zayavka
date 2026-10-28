/** Календарные даты — строки YYYY-MM-DD в часовом поясе бизнеса; время — ISO-строки с поясом. */

const DAY_MS = 86_400_000

export function todayIn(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

export function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

/** Дата записи в поясе бизнеса: YYYY-MM-DD. */
export function dateOf(iso: string, tz: string): string {
  return todayIn(tz, new Date(iso))
}

export function formatRange(startIso: string, endIso: string, tz: string): string {
  return `${formatTime(startIso, tz)}–${formatTime(endIso, tz)}`
}

export function formatDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

export function formatShortDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

function offsetMinutes(tz: string, at: Date): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((item) => item.type === 'timeZoneName')?.value
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(part ?? '')
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === '-' ? -minutes : minutes
}

/** Подпись пояса бизнеса («GMT+7»), если он отличается от пояса устройства; иначе null. */
export function timezoneNote(
  tz: string,
  at: Date = new Date(),
  deviceTz: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string | null {
  if (offsetMinutes(tz, at) === offsetMinutes(deviceTz, at)) return null
  return (
    new Intl.DateTimeFormat('ru-RU', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((item) => item.type === 'timeZoneName')?.value ?? tz
  )
}

export type DayPart = 'morning' | 'day' | 'evening'

export function dayPart(iso: string, tz: string): DayPart {
  const hour = Number(
    new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(
      new Date(iso),
    ),
  )
  if (hour < 12) return 'morning'
  return hour < 17 ? 'day' : 'evening'
}

export interface TimeSlot {
  starts_at: string
  ends_at: string
}

/** Группы «Утро / День / Вечер»: пустые не возвращаются, порядок слотов сохраняется. */
export function groupSlots(
  slots: TimeSlot[],
  tz: string,
  labels: Record<DayPart, string>,
): { label: string; slots: { value: string; label: string }[] }[] {
  const order: DayPart[] = ['morning', 'day', 'evening']
  return order
    .map((part) => ({
      label: labels[part],
      slots: slots
        .filter((slot) => dayPart(slot.starts_at, tz) === part)
        .map((slot) => ({ value: slot.starts_at, label: formatTime(slot.starts_at, tz) })),
    }))
    .filter((group) => group.slots.length > 0)
}
