/** Даты бизнеса — строки YYYY-MM-DD в его часовом поясе; моменты — ISO с поясом. */

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

function offsetMinutes(tz: string, at: Date): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((item) => item.type === 'timeZoneName')?.value
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(part ?? '')
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === '-' ? -minutes : minutes
}

/** Минуты от полуночи в часовом поясе бизнеса. */
export function minutesOfDay(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return get('hour') * 60 + get('minute')
}

/** Дата + минуты от полуночи в часовом поясе → ISO в UTC (с учётом перехода на летнее время). */
export function zonedToIso(date: string, minute: number, tz: string): string {
  const guess = Date.parse(`${date}T00:00:00Z`) + minute * 60_000
  const first = offsetMinutes(tz, new Date(guess))
  let at = guess - first * 60_000
  const second = offsetMinutes(tz, new Date(at))
  if (second !== first) at = guess - second * 60_000
  return new Date(at).toISOString()
}

export function dateOf(iso: string, tz: string): string {
  return todayIn(tz, new Date(iso))
}

export function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

export function formatRange(startIso: string, endIso: string, tz: string): string {
  return `${formatTime(startIso, tz)}–${formatTime(endIso, tz)}`
}

/** «минуты от полуночи» → «09:30». */
export function hm(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** «вторник, 20 октября» для даты YYYY-MM-DD. */
export function formatDay(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function durationMin(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000)
}
