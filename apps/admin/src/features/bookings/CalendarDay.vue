<script setup lang="ts">
import { ApiError } from '@app/api-client'
import { EmptyState, ErrorState, Field, Select, Skeleton, Stack, TimeGrid } from '@app/ui'
import type { GridColumn, GridEvent, GridRange, SelectOption } from '@app/ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { adminConfig } from '../../../admin.config'
import { formatRange, minutesOfDay, todayIn, zonedToIso } from '../../lib/zoned'
import { useCalendarQuery, useSettingsQuery } from './queries'
import { GRID_TONE } from './statuses'

const props = defineProps<{ date: string }>()
const emit = defineEmits<{
  'select-booking': [id: string]
  'select-cell': [cell: { resourceId: string; startsAt: string }]
}>()

const tz = adminConfig.timezone
const HOUR = 60
const DAY_END = 1440
const FALLBACK_RANGE: [number, number] = [8 * HOUR, 20 * HOUR]

const calendar = useCalendarQuery(() => props.date)
const settings = useSettingsQuery()

const step = computed(() => settings.data.value?.slot_step_min ?? 15)
const resources = computed(() => (calendar.data.value?.resources ?? []).filter((r) => r.is_active))

// На мобильном — по одному сотруднику с переключателем (раздел 11.1 ТЗ).
const compact = ref(false)
let media: MediaQueryList | undefined
const onMedia = (event: MediaQueryListEvent): void => {
  compact.value = !event.matches
}
onMounted(() => {
  media = window.matchMedia('(min-width: 768px)')
  compact.value = !media.matches
  media.addEventListener('change', onMedia)
})
onBeforeUnmount(() => media?.removeEventListener('change', onMedia))

const picked = ref<string>('')
const selectedResource = computed(
  () => resources.value.find((r) => r.id === picked.value)?.id ?? resources.value[0]?.id ?? '',
)
const resourceOptions = computed<SelectOption[]>(() =>
  resources.value.map((r) => ({ value: r.id, text: r.name })),
)
const visibleResources = computed(() =>
  compact.value ? resources.value.filter((r) => r.id === selectedResource.value) : resources.value,
)
const columns = computed<GridColumn[]>(() =>
  visibleResources.value.map((r) => ({
    id: r.id,
    title: r.title ? `${r.name} (${r.title})` : r.name,
  })),
)

const shown = computed(() =>
  (calendar.data.value?.bookings ?? []).filter(
    (b) => b.status in GRID_TONE && visibleResources.value.some((r) => r.id === b.resource.id),
  ),
)

/** От самого раннего начала до самого позднего конца работы за день (± 1 ч). */
const range = computed<[number, number]>(() => {
  const marks: number[] = []
  for (const id of visibleResources.value.map((r) => r.id)) {
    for (const [from, to] of calendar.data.value?.working[id] ?? []) marks.push(from, to)
  }
  for (const b of shown.value) {
    marks.push(minutesOfDay(b.starts_at, tz), minutesOfDay(b.ends_at, tz) || DAY_END)
  }
  if (marks.length === 0) return FALLBACK_RANGE
  const start = Math.max(0, Math.floor((Math.min(...marks) - HOUR) / HOUR) * HOUR)
  const end = Math.min(DAY_END, Math.ceil((Math.max(...marks) + HOUR) / HOUR) * HOUR)
  return [start, end]
})

const events = computed<GridEvent[]>(() =>
  shown.value.map((b) => {
    const start = minutesOfDay(b.starts_at, tz)
    const end = minutesOfDay(b.ends_at, tz) || DAY_END
    return {
      id: b.id,
      columnId: b.resource.id,
      startMin: start,
      endMin: end,
      title: b.service.title,
      subtitle: b.client_name,
      label: `${b.service.title} ${b.client_name}, ${formatRange(b.starts_at, b.ends_at, tz)}`,
      tone: GRID_TONE[b.status] ?? 'default',
    }
  }),
)

/** Нерабочее время: всё, что вне интервалов работы сотрудника в видимом диапазоне. */
const unavailable = computed<GridRange[]>(() => {
  const [from, to] = range.value
  return visibleResources.value.flatMap((r) => {
    const work = [...(calendar.data.value?.working[r.id] ?? [])].sort((a, b) => a[0] - b[0])
    const blocks: GridRange[] = []
    let cursor = from
    for (const [start, end] of work) {
      if (start > cursor)
        blocks.push({ columnId: r.id, startMin: cursor, endMin: Math.min(start, to) })
      cursor = Math.max(cursor, end)
    }
    if (cursor < to) blocks.push({ columnId: r.id, startMin: cursor, endMin: to })
    return blocks.filter((b) => b.endMin > b.startMin)
  })
})

// Линия «сейчас» только на текущем дне; обновляется раз в минуту.
const clock = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (clock.value = Date.now()), 60_000)
})
onBeforeUnmount(() => clearInterval(timer))
const now = computed(() =>
  props.date === todayIn(tz, new Date(clock.value))
    ? minutesOfDay(new Date(clock.value).toISOString(), tz)
    : null,
)

function selectCell(cell: { columnId: string; minute: number }): void {
  emit('select-cell', {
    resourceId: cell.columnId,
    startsAt: zonedToIso(props.date, cell.minute, tz),
  })
}

const errorCode = computed(() =>
  calendar.error.value instanceof ApiError ? calendar.error.value.code : 'internal_error',
)
</script>

<template>
  <ErrorState v-if="calendar.isError.value" :code="errorCode" @retry="calendar.refetch()" />
  <Stack v-else-if="calendar.isPending.value" :gap="3"><Skeleton height="12rem" /></Stack>
  <EmptyState
    v-else-if="resources.length === 0"
    title="admin.bookings.calendar.noResources"
    description="admin.bookings.calendar.noResourcesHint"
  />
  <Stack v-else :gap="3">
    <Field v-if="compact" v-slot="{ id }" label="admin.bookings.calendar.resource">
      <Select
        :id="id"
        :model-value="selectedResource"
        :options="resourceOptions"
        @update:model-value="(v) => (picked = v)"
      />
    </Field>
    <TimeGrid
      :columns="columns"
      :start-min="range[0]"
      :end-min="range[1]"
      :step="step"
      :events="events"
      :unavailable="unavailable"
      :now="now"
      @select-event="(id) => emit('select-booking', id)"
      @select-cell="selectCell"
    />
  </Stack>
</template>
