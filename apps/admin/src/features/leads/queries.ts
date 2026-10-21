import type { components } from '@app/api-client'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { type MaybeRefOrGetter, toValue } from 'vue'

import { adminConfig } from '../../../admin.config'
import { api } from '../../api'
import type { LeadStatus } from './statuses'

export type Lead = components['schemas']['LeadOut']
export type LeadEvent = components['schemas']['EventOut']
export type LeadDetail = components['schemas']['LeadDetail']
export type LeadPage = components['schemas']['LeadPage']

export interface LeadFilters {
  q: string
  status: LeadStatus | ''
  dateFrom: string
  dateTo: string
  page: number
  sort: 'created_at' | '-created_at'
}

/** Параметры запроса списка и экспорта (экспорт без страницы и сортировки). */
export function filterQuery(filters: LeadFilters) {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
    ...(filters.dateTo ? { date_to: filters.dateTo } : {}),
  }
}

export const leadsKey = (filters: LeadFilters) => ['leads', 'list', filters] as const
export const leadKey = (id: string) => ['leads', 'detail', id] as const
export const NEW_COUNT_KEY = ['leads', 'new-count'] as const

export function useLeadsQuery(filters: MaybeRefOrGetter<LeadFilters>) {
  return useQuery({
    queryKey: () => leadsKey(toValue(filters)),
    queryFn: async () => {
      const f = toValue(filters)
      const { data } = await api.GET('/api/v1/admin/leads', {
        params: {
          query: {
            ...filterQuery(f),
            page: f.page,
            page_size: adminConfig.pageSize,
            sort: f.sort,
          },
        },
      })
      if (!data) throw new Error('empty response')
      return data
    },
    placeholderData: keepPreviousData,
  })
}

export function useLeadQuery(id: MaybeRefOrGetter<string | undefined>) {
  return useQuery({
    queryKey: () => leadKey(toValue(id) ?? ''),
    queryFn: async () => {
      const leadId = toValue(id)
      if (!leadId) throw new Error('no id')
      const { data } = await api.GET('/api/v1/admin/leads/{lead_id}', {
        params: { path: { lead_id: leadId } },
      })
      if (!data) throw new Error('empty response')
      return data
    },
    enabled: () => Boolean(toValue(id)),
    retry: false,
  })
}

/** Число новых заявок для бейджа: обновляется раз в минуту, пока вкладка активна. */
export function useNewLeadsCount() {
  return useQuery({
    queryKey: NEW_COUNT_KEY,
    queryFn: async () => {
      const { data } = await api.GET('/api/v1/admin/leads', {
        params: { query: { status: 'new', page_size: 10 } },
      })
      return data?.total ?? 0
    },
    refetchInterval: adminConfig.newLeadsRefreshMs,
    refetchIntervalInBackground: false,
  })
}

export function useChangeStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status: LeadStatus; version: number }) => {
      const { data } = await api.PATCH('/api/v1/admin/leads/{lead_id}', {
        params: { path: { lead_id: input.id } },
        body: { status: input.status, version: input.version },
      })
      return data
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useAddNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; text: string }) => {
      const { data } = await api.POST('/api/v1/admin/leads/{lead_id}/notes', {
        params: { path: { lead_id: input.id } },
        body: { text: input.text },
      })
      return data
    },
    onSuccess: (_data, input) => queryClient.invalidateQueries({ queryKey: leadKey(input.id) }),
  })
}

/** Скачивание CSV с текущими фильтрами (файл приходит потоком, поэтому через fetch и Blob). */
export async function downloadLeadsCsv(filters: LeadFilters): Promise<void> {
  const params = new URLSearchParams(filterQuery(filters) as Record<string, string>)
  const response = await fetch(`/api/v1/admin/leads/export.csv?${params.toString()}`, {
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(`export failed: ${response.status}`)
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'leads.csv'
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
