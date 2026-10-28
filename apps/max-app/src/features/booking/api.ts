import type { components } from '@app/api-client'

import { api } from '../../api'
import type { BookingView } from '../../stores/bookingDraft'

export type BookingCreate = components['schemas']['BookingCreate']
export type Day = components['schemas']['DayAvailability']
export type Slots = components['schemas']['SlotsOut']
export type BookingPage = components['schemas']['BookingPage']

export async function fetchDays(
  service: string,
  resource: string,
  from: string,
  to: string,
): Promise<Day[]> {
  const { data } = await api.GET('/api/v1/max/app/availability/days', {
    params: { query: { service, resource, from, to } },
  })
  return data as Day[]
}

export async function fetchSlots(service: string, resource: string, date: string): Promise<Slots> {
  const { data } = await api.GET('/api/v1/max/app/availability/slots', {
    params: { query: { service, resource, date } },
  })
  return data as Slots
}

export async function createBooking(
  body: BookingCreate,
  idempotencyKey: string,
): Promise<BookingView> {
  const { data } = await api.POST('/api/v1/max/app/bookings', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body,
  })
  return data as BookingView
}

export async function rescheduleBooking(
  id: string,
  body: { starts_at: string; resource_id: string | null; version: number },
  idempotencyKey: string,
): Promise<BookingView> {
  const { data } = await api.POST('/api/v1/max/app/bookings/{booking_id}/reschedule', {
    params: { path: { booking_id: id }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
  })
  return data as BookingView
}

export async function cancelBooking(id: string, version: number): Promise<BookingView> {
  const { data } = await api.POST('/api/v1/max/app/bookings/{booking_id}/cancel', {
    params: { path: { booking_id: id } },
    body: { version },
  })
  return data as BookingView
}

export async function fetchBookings(
  scope: 'upcoming' | 'past',
  page: number,
): Promise<BookingPage> {
  const { data } = await api.GET('/api/v1/max/app/bookings', {
    params: { query: { scope, page } },
  })
  return data as BookingPage
}

export async function createLead(body: components['schemas']['LeadCreate']): Promise<number> {
  const { data } = await api.POST('/api/v1/max/app/leads', { body })
  return (data as components['schemas']['MaxLeadCreated']).public_number
}

export function calendarUrl(id: string): string {
  return `/api/v1/max/app/bookings/${id}/calendar.ics`
}
