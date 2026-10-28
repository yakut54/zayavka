import type { components } from '@app/api-client'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { type MaybeRefOrGetter, toValue } from 'vue'

import { adminConfig } from '../../../admin.config'
import { api } from '../../api'
import { todayIn } from '../../lib/zoned'
import type { BookingStatus } from './statuses'

export type Booking = components['schemas']['AdminBookingOut']
export type BookingDetail = components['schemas']['AdminBookingDetail']
export type BookingPage = components['schemas']['AdminBookingPage']
export type Calendar = components['schemas']['CalendarOut']
export type AdminResource = components['schemas']['ResourceAdminOut']
export type AdminSlots = components['schemas']['SlotsAdminOut']
export type BookingSettings = components['schemas']['BookingSettingsOut']
export type ManualBooking = components['schemas']['AdminBookingCreate']

export interface BookingFilters {
  view: 'day' | 'list'
  /** День календаря (YYYY-MM-DD). */
  date: string
  dateFrom: string
  dateTo: string
  resourceId: string
  status: BookingStatus | ''
  q: string
  page: number
}

/** Параметры списка и экспорта (экспорт — без страницы). */
export function listQuery(filters: BookingFilters) {
  return {
    ...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
    ...(filters.dateTo ? { date_to: filters.dateTo } : {}),
    ...(filters.resourceId ? { resource_id: filters.resourceId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { q: filters.q } : {}),
  }
}

export const BOOKINGS_KEY = ['bookings'] as const
export const calendarKey = (date: string) => ['bookings', 'calendar', date] as const
export const bookingKey = (id: string) => ['bookings', 'detail', id] as const
export const SETTINGS_KEY = ['booking-settings'] as const
export const RESOURCES_KEY = ['resources'] as const

const REFRESH_MS = 60_000

/** Календарь дня: обновляется раз в минуту, пока вкладка активна. */
export function useCalendarQuery(date: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: () => calendarKey(toValue(date)),
    queryFn: async () => {
      const { data } = await api.GET('/api/v1/admin/bookings/calendar', {
        params: { query: { date: toValue(date) } },
      })
      if (!data) throw new Error('empty response')
      return data
    },
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  })
}

export function useBookingsQuery(filters: MaybeRefOrGetter<BookingFilters>) {
  return useQuery({
    queryKey: () => ['bookings', 'list', toValue(filters)] as const,
    queryFn: async () => {
      const f = toValue(filters)
      const { data } = await api.GET('/api/v1/admin/bookings', {
        params: { query: { ...listQuery(f), page: f.page, page_size: adminConfig.pageSize } },
      })
      if (!data) throw new Error('empty response')
      return data
    },
    placeholderData: keepPreviousData,
  })
}

export function useBookingQuery(id: MaybeRefOrGetter<string | undefined>) {
  return useQuery({
    queryKey: () => bookingKey(toValue(id) ?? ''),
    queryFn: async () => {
      const bookingId = toValue(id)
      if (!bookingId) throw new Error('no id')
      const { data } = await api.GET('/api/v1/admin/bookings/{booking_id}', {
        params: { path: { booking_id: bookingId } },
      })
      if (!data) throw new Error('empty response')
      return data
    },
    enabled: () => Boolean(toValue(id)),
    retry: false,
  })
}

/** Число записей на сегодня для меню. */
export function useTodayCount() {
  return useQuery({
    queryKey: ['bookings', 'today-count'] as const,
    queryFn: async () => {
      const today = todayIn(adminConfig.timezone)
      const { data } = await api.GET('/api/v1/admin/bookings', {
        params: {
          query: { date_from: today, date_to: today, status: 'confirmed', page_size: 10 },
        },
      })
      return data?.total ?? 0
    },
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  })
}

export function useSettingsQuery() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const { data } = await api.GET('/api/v1/admin/booking-settings')
      if (!data) throw new Error('empty response')
      return data
    },
    staleTime: 5 * 60_000,
  })
}

export function useResourcesQuery() {
  return useQuery({
    queryKey: RESOURCES_KEY,
    queryFn: async () => {
      const { data } = await api.GET('/api/v1/admin/resources')
      return data ?? []
    },
  })
}

/** Свободные слоты для администратора: ближайшее время тоже доступно (`ignore_lead_time`). */
export function useAdminSlots(
  params: MaybeRefOrGetter<{ service: string; resource: string; date: string } | null>,
) {
  return useQuery({
    queryKey: () => ['bookings', 'slots', toValue(params)] as const,
    queryFn: async () => {
      const p = toValue(params)
      if (!p) throw new Error('no params')
      const { data } = await api.GET('/api/v1/admin/bookings/slots', {
        params: { query: { ...p, ignore_lead_time: true } },
      })
      if (!data) throw new Error('empty response')
      return data
    },
    enabled: () => toValue(params) !== null,
    staleTime: 15_000,
  })
}

export function useCreateBooking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ManualBooking) => {
      const { data } = await api.POST('/api/v1/admin/bookings', { body })
      return data
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  })
}

export function useChangeBookingStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      status: 'completed' | 'no_show' | 'cancelled_by_business'
      version: number
      cancelReason?: string
      notifyClient?: boolean
    }) => {
      const { data } = await api.PATCH('/api/v1/admin/bookings/{booking_id}', {
        params: { path: { booking_id: input.id } },
        body: {
          status: input.status,
          version: input.version,
          ...(input.cancelReason ? { cancel_reason: input.cancelReason } : {}),
          notify_client: input.notifyClient ?? true,
        },
      })
      return data
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  })
}

export function useRescheduleBooking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      startsAt: string
      resourceId: string | null
      version: number
      notifyClient: boolean
    }) => {
      const { data } = await api.POST('/api/v1/admin/bookings/{booking_id}/reschedule', {
        params: { path: { booking_id: input.id } },
        body: {
          starts_at: input.startsAt,
          resource_id: input.resourceId,
          version: input.version,
          notify_client: input.notifyClient,
        },
      })
      return data
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  })
}

export function useAddBookingNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; text: string }) => {
      const { data } = await api.POST('/api/v1/admin/bookings/{booking_id}/notes', {
        params: { path: { booking_id: input.id } },
        body: { text: input.text },
      })
      return data
    },
    onSuccess: (_data, input) => queryClient.invalidateQueries({ queryKey: bookingKey(input.id) }),
  })
}

/** CSV с текущими фильтрами списка (файл приходит потоком, поэтому через fetch и Blob). */
export async function downloadBookingsCsv(filters: BookingFilters): Promise<void> {
  const params = new URLSearchParams(listQuery(filters) as Record<string, string>)
  const response = await fetch(`/api/v1/admin/bookings/export.csv?${params.toString()}`, {
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(`export failed: ${response.status}`)
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'bookings.csv'
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
