import type { MessageKey } from '@app/i18n'

export type BookingStatus =
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'cancelled_by_client'
  | 'cancelled_by_business'
  | 'rescheduled'

export const BOOKING_STATUSES: BookingStatus[] = [
  'confirmed',
  'completed',
  'no_show',
  'cancelled_by_client',
  'cancelled_by_business',
  'rescheduled',
]

export type BadgeTone = 'accent' | 'warning' | 'success' | 'danger' | 'muted'

export const BOOKING_TONE: Record<BookingStatus, BadgeTone> = {
  confirmed: 'accent',
  completed: 'success',
  no_show: 'warning',
  cancelled_by_client: 'muted',
  cancelled_by_business: 'danger',
  rescheduled: 'muted',
}

/** Цвет блока на календаре; отменённые и перенесённые на сетке не показываются. */
export const GRID_TONE: Record<string, 'default' | 'success' | 'danger'> = {
  confirmed: 'default',
  completed: 'success',
  no_show: 'danger',
}

export const bookingStatusLabel = (status: BookingStatus): MessageKey =>
  `admin.bookings.statuses.${status}`

export const isBookingStatus = (value: unknown): value is BookingStatus =>
  typeof value === 'string' && (BOOKING_STATUSES as string[]).includes(value)

export const sourceLabel = (source: string): MessageKey =>
  (['max', 'admin', 'demo'].includes(source)
    ? `admin.bookings.sources.${source}`
    : 'admin.bookings.sources.other') as MessageKey
