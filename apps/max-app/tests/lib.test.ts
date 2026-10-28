import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { normalizeContactPhone } from '../src/features/booking/contactSchema'
import {
  addDays,
  dateOf,
  dayPart,
  formatDateTime,
  formatRange,
  formatShortDateTime,
  formatTime,
  groupSlots,
  timezoneNote,
  todayIn,
} from '../src/lib/time'
import { type BookingView, useBookingDraft } from '../src/stores/bookingDraft'

const TZ = 'Asia/Novosibirsk'

describe('время бизнеса', () => {
  it('сегодня и сдвиг дат считаются в поясе бизнеса', () => {
    // 20:30 UTC 19 мая — в Новосибирске уже 20 мая
    expect(todayIn(TZ, new Date('2030-05-19T20:30:00Z'))).toBe('2030-05-20')
    expect(todayIn('UTC', new Date('2030-05-19T20:30:00Z'))).toBe('2030-05-19')
    expect(addDays('2030-02-27', 3)).toBe('2030-03-02')
    expect(addDays('2030-01-01', -1)).toBe('2029-12-31')
  })

  it('форматы времени и диапазона', () => {
    expect(formatTime('2030-05-20T03:00:00Z', TZ)).toBe('10:00')
    expect(formatTime('2030-05-20T17:05:00Z', TZ)).toBe('00:05')
    expect(formatRange('2030-05-20T03:00:00Z', '2030-05-20T04:30:00Z', TZ)).toBe('10:00–11:30')
    expect(dateOf('2030-05-19T20:30:00Z', TZ)).toBe('2030-05-20')
    expect(formatDateTime('2030-05-20T03:00:00Z', TZ)).toContain('20 мая')
    expect(formatShortDateTime('2030-05-20T03:00:00Z', TZ)).toContain('20.05')
  })

  it('пояс бизнеса показывается, только если отличается от пояса устройства', () => {
    const at = new Date('2030-05-20T03:00:00Z')
    expect(timezoneNote(TZ, at, TZ)).toBeNull()
    expect(timezoneNote(TZ, at, 'Asia/Krasnoyarsk')).toBeNull() // тоже +7
    expect(timezoneNote(TZ, at, 'Europe/Moscow')).toMatch(/\+7/)
  })

  it('части дня и группы слотов: пустые не показываются', () => {
    expect(dayPart('2030-05-20T04:59:00Z', TZ)).toBe('morning') // 11:59
    expect(dayPart('2030-05-20T05:00:00Z', TZ)).toBe('day') // 12:00
    expect(dayPart('2030-05-20T09:59:00Z', TZ)).toBe('day') // 16:59
    expect(dayPart('2030-05-20T10:00:00Z', TZ)).toBe('evening') // 17:00
    const labels = { morning: 'Утро', day: 'День', evening: 'Вечер' }
    const groups = groupSlots(
      [
        { starts_at: '2030-05-20T03:00:00Z', ends_at: '2030-05-20T04:00:00Z' },
        { starts_at: '2030-05-20T12:00:00Z', ends_at: '2030-05-20T13:00:00Z' },
      ],
      TZ,
      labels,
    )
    expect(groups.map((g) => g.label)).toEqual(['Утро', 'Вечер'])
    expect(groups[0]?.slots).toEqual([{ value: '2030-05-20T03:00:00Z', label: '10:00' }])
    expect(groupSlots([], TZ, labels)).toEqual([])
  })
})

describe('телефон из MAX', () => {
  it('приводится к 7XXXXXXXXXX', () => {
    expect(normalizeContactPhone('+7 (999) 123-45-67')).toBe('79991234567')
    expect(normalizeContactPhone('89991234567')).toBe('79991234567')
    expect(normalizeContactPhone('79991234567')).toBe('79991234567')
  })
})

describe('черновик записи', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const view = {
    id: 'b1',
    version: 3,
    service: { slug: 'tires', title: 'Шины' },
    resource: { id: 'r1', name: 'Иван', title: null },
  } as unknown as BookingView

  it('смена услуги сбрасывает специалиста, дату и время; повтор того же — нет', () => {
    const draft = useBookingDraft()
    draft.setService('a')
    draft.setResource('any')
    draft.setDate('2030-05-20')
    draft.setSlot('2030-05-20T03:00:00Z')
    draft.setService('a')
    expect(draft.startsAt).toBe('2030-05-20T03:00:00Z')
    draft.setService('b')
    expect([draft.resource, draft.date, draft.startsAt]).toEqual([null, null, null])
  })

  it('смена специалиста сбрасывает дату и время; смена даты — время', () => {
    const draft = useBookingDraft()
    draft.setService('a')
    draft.setResource('r1')
    draft.setDate('2030-05-20')
    draft.setSlot('2030-05-20T03:00:00Z')
    draft.setResource('r1')
    expect(draft.date).toBe('2030-05-20')
    draft.setDate('2030-05-20')
    expect(draft.startsAt).toBe('2030-05-20T03:00:00Z')
    draft.setDate('2030-05-21')
    expect(draft.startsAt).toBeNull()
    draft.setResource('r2')
    expect(draft.date).toBeNull()
  })

  it('ключ идемпотентности создаётся один раз и сбрасывается при смене выбора', () => {
    const draft = useBookingDraft()
    const key = draft.ensureIdempotencyKey()
    expect(draft.ensureIdempotencyKey()).toBe(key)
    draft.setSlot('2030-05-20T03:00:00Z')
    expect(draft.idempotencyKey).toBeNull()
  })

  it('перенос берёт услугу и специалиста из записи; reset оставляет имя и телефон', () => {
    const draft = useBookingDraft()
    draft.name = 'Анна'
    draft.phone = '79990000000'
    draft.startReschedule(view)
    expect(draft.isReschedule).toBe(true)
    expect([draft.serviceSlug, draft.resource]).toEqual(['tires', 'r1'])
    draft.changeResourceForReschedule()
    expect([draft.changingResource, draft.resource]).toEqual([true, null])
    draft.reset()
    expect(draft.isReschedule).toBe(false)
    expect([draft.serviceSlug, draft.name, draft.phone]).toEqual([null, 'Анна', '79990000000'])
  })
})
