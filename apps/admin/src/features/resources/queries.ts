import { ApiError, type components } from '@app/api-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { type MaybeRefOrGetter, toValue } from 'vue'

import { api } from '../../api'
import { BOOKINGS_KEY, RESOURCES_KEY, SETTINGS_KEY } from '../bookings/queries'

export type Resource = components['schemas']['ResourceAdminOut']
export type WorkingHours = components['schemas']['WorkingHoursOut']
export type ScheduleException = components['schemas']['ExceptionOut']
export type ExceptionCreate = components['schemas']['ExceptionCreate']
export type BookingSettings = components['schemas']['BookingSettingsOut']
export type SettingsPatch = components['schemas']['BookingSettingsPatch']

export interface ConflictBooking {
  id: string
  public_number: number
  starts_at: string
  client_name: string
  service_title: string
}

/** Изменение графика задевает записи: показывается диалог выбора (раздел 11.6 ТЗ). */
export function conflictsOf(error: unknown): ConflictBooking[] | null {
  if (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === 'conflicts_with_bookings'
  ) {
    return (error.body.bookings as ConflictBooking[] | undefined) ?? []
  }
  return null
}

export interface ForceOptions {
  /** Сохранить, несмотря на конфликты. */
  force?: boolean
  /** Вместе с `force`: отменить конфликтующие записи и уведомить клиентов. */
  cancelConflicting?: boolean
}

const forceQuery = (options: ForceOptions) => ({
  ...(options.force ? { force: true } : {}),
  ...(options.cancelConflicting ? { cancel_conflicting: true } : {}),
})

export const hoursKey = (id: string) => ['resources', id, 'working-hours'] as const
export const exceptionsKey = (id: string) => ['resources', id, 'exceptions'] as const

export function useWorkingHoursQuery(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: () => hoursKey(toValue(id)),
    queryFn: async () => {
      const { data } = await api.GET('/api/v1/admin/resources/{resource_id}/working-hours', {
        params: { path: { resource_id: toValue(id) } },
      })
      if (!data) throw new Error('empty response')
      return data
    },
  })
}

export function useExceptionsQuery(
  id: MaybeRefOrGetter<string>,
  range: MaybeRefOrGetter<{ from: string; to: string }>,
) {
  return useQuery({
    queryKey: () => [...exceptionsKey(toValue(id)), toValue(range)] as const,
    queryFn: async () => {
      const { from, to } = toValue(range)
      const { data } = await api.GET('/api/v1/admin/resources/{resource_id}/exceptions', {
        params: {
          path: { resource_id: toValue(id) },
          query: { date_from: from, date_to: to },
        },
      })
      return data ?? []
    },
  })
}

export function useCreateResource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: components['schemas']['ResourceCreate']) => {
      const { data } = await api.POST('/api/v1/admin/resources', { body })
      return data as Resource
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: RESOURCES_KEY }),
  })
}

export function usePatchResource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; body: components['schemas']['ResourcePatch'] }) => {
      const { data } = await api.PATCH('/api/v1/admin/resources/{resource_id}', {
        params: { path: { resource_id: input.id } },
        body: input.body,
      })
      return data as Resource
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: RESOURCES_KEY }),
  })
}

export function useDeleteResource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.DELETE('/api/v1/admin/resources/{resource_id}', {
        params: { path: { resource_id: id } },
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: RESOURCES_KEY }),
  })
}

export function useSetServices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; slugs: string[] }) => {
      const { data } = await api.PUT('/api/v1/admin/resources/{resource_id}/services', {
        params: { path: { resource_id: input.id } },
        body: { service_slugs: input.slugs },
      })
      return data as Resource
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: RESOURCES_KEY }),
  })
}

export function useSaveWorkingHours() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      days: Record<number, [number, number][]>
      options?: ForceOptions
    }) => {
      const { data } = await api.PUT('/api/v1/admin/resources/{resource_id}/working-hours', {
        params: {
          path: { resource_id: input.id },
          query: forceQuery(input.options ?? {}),
        },
        body: { days: input.days },
      })
      return data as WorkingHours
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: hoursKey(input.id) })
      void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY })
    },
  })
}

export function useSaveException() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; body: ExceptionCreate; options?: ForceOptions }) => {
      const { data } = await api.POST('/api/v1/admin/resources/{resource_id}/exceptions', {
        params: {
          path: { resource_id: input.id },
          query: forceQuery(input.options ?? {}),
        },
        body: input.body,
      })
      return data as ScheduleException
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: exceptionsKey(input.id) })
      void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY })
    },
  })
}

export function useDeleteException() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; exceptionId: string; options?: ForceOptions }) => {
      await api.DELETE('/api/v1/admin/resources/{resource_id}/exceptions/{exception_id}', {
        params: {
          path: { resource_id: input.id, exception_id: input.exceptionId },
          query: forceQuery(input.options ?? {}),
        },
      })
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: exceptionsKey(input.id) })
      void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY })
    },
  })
}

export function useSaveSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: SettingsPatch) => {
      const { data } = await api.PATCH('/api/v1/admin/booking-settings', { body })
      return data as BookingSettings
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}
