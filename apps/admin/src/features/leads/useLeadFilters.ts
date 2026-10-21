import { computed } from 'vue'
import { type LocationQueryRaw, useRoute, useRouter } from 'vue-router'

import type { LeadFilters } from './queries'
import { isLeadStatus } from './statuses'

const DATE = /^\d{4}-\d{2}-\d{2}$/

function first(value: unknown): string {
  const item = Array.isArray(value) ? value[0] : value
  return typeof item === 'string' ? item : ''
}

/** Разбор query-параметров URL в фильтры списка (мусор отбрасывается). */
export function parseFilters(query: Record<string, unknown>): LeadFilters {
  const status = first(query.status)
  const page = Number.parseInt(first(query.page), 10)
  const dateFrom = first(query.date_from)
  const dateTo = first(query.date_to)
  return {
    q: first(query.q).slice(0, 100),
    status: isLeadStatus(status) ? status : '',
    dateFrom: DATE.test(dateFrom) ? dateFrom : '',
    dateTo: DATE.test(dateTo) ? dateTo : '',
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100_000) : 1,
    sort: first(query.sort) === 'created_at' ? 'created_at' : '-created_at',
  }
}

/** Фильтры → query URL: значения по умолчанию в адрес не попадают. */
export function toQuery(filters: LeadFilters): LocationQueryRaw {
  return {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
    ...(filters.dateTo ? { date_to: filters.dateTo } : {}),
    ...(filters.page > 1 ? { page: String(filters.page) } : {}),
    ...(filters.sort === 'created_at' ? { sort: 'created_at' } : {}),
  }
}

/** Все фильтры списка синхронизированы с URL: ссылку можно сохранить и отправить. */
export function useLeadFilters() {
  const route = useRoute()
  const router = useRouter()

  const filters = computed(() => parseFilters(route.query))

  const hasActive = computed(() =>
    Boolean(
      filters.value.q || filters.value.status || filters.value.dateFrom || filters.value.dateTo,
    ),
  )

  const dateRangeInvalid = computed(
    () =>
      Boolean(filters.value.dateFrom && filters.value.dateTo) &&
      filters.value.dateTo < filters.value.dateFrom,
  )

  /** Любое изменение фильтров (кроме самой страницы) сбрасывает страницу на первую. */
  async function update(patch: Partial<LeadFilters>): Promise<void> {
    const next = { ...filters.value, ...patch }
    if (!('page' in patch)) next.page = 1
    await router.replace({ name: 'leads', params: route.params, query: toQuery(next) })
  }

  async function reset(): Promise<void> {
    await router.replace({ name: 'leads', params: route.params, query: {} })
  }

  return { filters, hasActive, dateRangeInvalid, update, reset }
}
