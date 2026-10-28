import { computed } from 'vue'
import { type LocationQueryRaw, useRoute, useRouter } from 'vue-router'

import { adminConfig } from '../../../admin.config'
import { todayIn } from '../../lib/zoned'
import type { BookingFilters } from './queries'
import { isBookingStatus } from './statuses'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function first(value: unknown): string {
  const item = Array.isArray(value) ? value[0] : value
  return typeof item === 'string' ? item : ''
}

/** Разбор query-параметров URL (мусор отбрасывается); день по умолчанию — сегодня у бизнеса. */
export function parseBookingFilters(
  query: Record<string, unknown>,
  today: string = todayIn(adminConfig.timezone),
): BookingFilters {
  const date = first(query.date)
  const from = first(query.from)
  const to = first(query.to)
  const resource = first(query.resource)
  const status = first(query.status)
  const page = Number.parseInt(first(query.page), 10)
  return {
    view: first(query.view) === 'list' ? 'list' : 'day',
    date: DATE.test(date) ? date : today,
    dateFrom: DATE.test(from) ? from : '',
    dateTo: DATE.test(to) ? to : '',
    resourceId: UUID.test(resource) ? resource : '',
    status: isBookingStatus(status) ? status : '',
    q: first(query.q).slice(0, 100),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100_000) : 1,
  }
}

/** Фильтры → query URL: значения по умолчанию в адрес не попадают. */
export function toBookingQuery(
  filters: BookingFilters,
  today: string = todayIn(adminConfig.timezone),
): LocationQueryRaw {
  return {
    ...(filters.view === 'list' ? { view: 'list' } : {}),
    ...(filters.date !== today ? { date: filters.date } : {}),
    ...(filters.dateFrom ? { from: filters.dateFrom } : {}),
    ...(filters.dateTo ? { to: filters.dateTo } : {}),
    ...(filters.resourceId ? { resource: filters.resourceId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.page > 1 ? { page: String(filters.page) } : {}),
  }
}

/** День, вид и фильтры списка живут в URL: ссылку можно сохранить и отправить. */
export function useBookingFilters() {
  const route = useRoute()
  const router = useRouter()

  const filters = computed(() => parseBookingFilters(route.query))

  const hasActive = computed(() =>
    Boolean(
      filters.value.q ||
      filters.value.status ||
      filters.value.resourceId ||
      filters.value.dateFrom ||
      filters.value.dateTo,
    ),
  )

  const dateRangeInvalid = computed(
    () =>
      Boolean(filters.value.dateFrom && filters.value.dateTo) &&
      filters.value.dateTo < filters.value.dateFrom,
  )

  async function update(patch: Partial<BookingFilters>): Promise<void> {
    const next = { ...filters.value, ...patch }
    if (!('page' in patch)) next.page = 1
    await router.replace({ name: 'bookings', params: route.params, query: toBookingQuery(next) })
  }

  async function reset(): Promise<void> {
    await update({ dateFrom: '', dateTo: '', resourceId: '', status: '', q: '' })
  }

  return { filters, hasActive, dateRangeInvalid, update, reset }
}
