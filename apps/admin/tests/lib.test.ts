import { describe, expect, it } from 'vitest'

import { parseBookingFilters, toBookingQuery } from '../src/features/bookings/useBookingFilters'
import {
  BOOKING_STATUSES,
  bookingStatusLabel,
  isBookingStatus,
  sourceLabel,
} from '../src/features/bookings/statuses'
import { conflictsOf } from '../src/features/resources/queries'
import {
  addDays,
  dateOf,
  durationMin,
  formatDay,
  formatRange,
  formatTime,
  hm,
  minutesOfDay,
  todayIn,
  zonedToIso,
} from '../src/lib/zoned'
import { ApiError } from '@app/api-client'

const TZ = 'Asia/Novosibirsk'

describe('время бизнеса', () => {
  it('сегодня, сдвиг дат, дата записи', () => {
    expect(todayIn(TZ, new Date('2030-05-19T20:30:00Z'))).toBe('2030-05-20')
    expect(addDays('2030-02-27', 3)).toBe('2030-03-02')
    expect(dateOf('2030-05-19T20:30:00Z', TZ)).toBe('2030-05-20')
  })

  it('минуты суток и обратное преобразование', () => {
    expect(minutesOfDay('2030-05-20T03:00:00Z', TZ)).toBe(600)
    expect(minutesOfDay('2030-05-19T17:05:00Z', TZ)).toBe(5)
    expect(zonedToIso('2030-05-20', 600, TZ)).toBe('2030-05-20T03:00:00.000Z')
    expect(zonedToIso('2030-05-20', 0, TZ)).toBe('2030-05-19T17:00:00.000Z')
  })

  it('переход на летнее время: 10:00 по Москве всегда 10:00', () => {
    // Europe/Berlin: +1 зимой, +2 летом; граница 31 марта 2030
    expect(zonedToIso('2030-01-15', 600, 'Europe/Berlin')).toBe('2030-01-15T09:00:00.000Z')
    expect(zonedToIso('2030-07-15', 600, 'Europe/Berlin')).toBe('2030-07-15T08:00:00.000Z')
    expect(minutesOfDay(zonedToIso('2030-03-31', 600, 'Europe/Berlin'), 'Europe/Berlin')).toBe(600)
  })

  it('форматы', () => {
    expect(formatTime('2030-05-20T03:00:00Z', TZ)).toBe('10:00')
    expect(formatRange('2030-05-20T03:00:00Z', '2030-05-20T04:30:00Z', TZ)).toBe('10:00–11:30')
    expect(hm(545)).toBe('09:05')
    expect(hm(1440)).toBe('00:00')
    expect(durationMin('2030-05-20T03:00:00Z', '2030-05-20T04:30:00Z')).toBe(90)
    expect(formatDay('2030-05-20')).toBe('понедельник, 20 мая')
  })
})

describe('фильтры записей в URL', () => {
  const today = '2030-05-20'

  it('мусор отбрасывается, значения по умолчанию подставляются', () => {
    expect(
      parseBookingFilters(
        {
          view: 'x',
          date: 'вчера',
          status: 'weird',
          resource: 'не-uuid',
          page: '-3',
          from: '2030-13',
        },
        today,
      ),
    ).toEqual({
      view: 'day',
      date: today,
      dateFrom: '',
      dateTo: '',
      resourceId: '',
      status: '',
      q: '',
      page: 1,
    })
  })

  it('разбор и обратная сборка симметричны, умолчания в адрес не попадают', () => {
    const query = {
      view: 'list',
      date: '2030-06-01',
      from: '2030-06-01',
      to: '2030-06-10',
      resource: '11111111-1111-4111-8111-111111111111',
      status: 'confirmed',
      q: 'Анна',
      page: '3',
    }
    const filters = parseBookingFilters(query, today)
    expect(filters).toMatchObject({ view: 'list', status: 'confirmed', page: 3, q: 'Анна' })
    expect(toBookingQuery(filters, today)).toEqual(query)
    expect(toBookingQuery(parseBookingFilters({}, today), today)).toEqual({})
    expect(parseBookingFilters({ q: 'я'.repeat(300) }, today).q).toHaveLength(100)
  })
})

describe('статусы', () => {
  it('подписи, источники и проверка значения', () => {
    expect(BOOKING_STATUSES).toHaveLength(6)
    expect(bookingStatusLabel('no_show')).toBe('admin.bookings.statuses.no_show')
    expect(isBookingStatus('completed')).toBe(true)
    expect(isBookingStatus('x')).toBe(false)
    expect(sourceLabel('admin')).toBe('admin.bookings.sources.admin')
    expect(sourceLabel('что-то')).toBe('admin.bookings.sources.other')
  })
})

describe('конфликты графика', () => {
  it('список записей берётся из тела 409', () => {
    const error = new ApiError({
      status: 409,
      code: 'conflicts_with_bookings',
      body: { bookings: [{ id: '1', public_number: 5 }] },
    })
    expect(conflictsOf(error)).toEqual([{ id: '1', public_number: 5 }])
    expect(conflictsOf(new ApiError({ status: 409, code: 'conflicts_with_bookings' }))).toEqual([])
    expect(conflictsOf(new ApiError({ status: 409, code: 'other' }))).toBeNull()
    expect(conflictsOf(new Error('x'))).toBeNull()
  })
})
