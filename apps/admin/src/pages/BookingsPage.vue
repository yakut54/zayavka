<script setup lang="ts">
import { Button, Field, Heading, IconButton, Inline, Input, Stack, Tabs } from '@app/ui'
import type { TabItem } from '@app/ui'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { adminConfig } from '../../admin.config'
import BookingDrawer from '../features/bookings/BookingDrawer.vue'
import BookingsList from '../features/bookings/BookingsList.vue'
import CalendarDay from '../features/bookings/CalendarDay.vue'
import ManualBookingDrawer from '../features/bookings/ManualBookingDrawer.vue'
import { useBookingFilters } from '../features/bookings/useBookingFilters'
import { addDays, todayIn } from '../lib/zoned'

const route = useRoute()
const router = useRouter()
const { filters, hasActive, dateRangeInvalid, update, reset } = useBookingFilters()

const views: TabItem[] = [
  { id: 'day', label: 'admin.bookings.viewDay' },
  { id: 'list', label: 'admin.bookings.viewList' },
]

const openId = computed(() => (typeof route.params.id === 'string' ? route.params.id : undefined))
const manualOpen = ref(false)
const manualInitial = ref<{ resourceId?: string; startsAt?: string } | null>(null)

function openBooking(id: string): void {
  void router.push({ name: 'bookings', params: { id }, query: route.query })
}

function closeBooking(): void {
  void router.push({ name: 'bookings', params: {}, query: route.query })
}

function openManual(cell: { resourceId: string; startsAt: string } | null = null): void {
  manualInitial.value = cell
  manualOpen.value = true
}

const shift = (days: number): Promise<void> => update({ date: addDays(filters.value.date, days) })
const today = (): Promise<void> => update({ date: todayIn(adminConfig.timezone) })
</script>

<template>
  <Stack :gap="5">
    <Inline :gap="3" justify="between" wrap>
      <Heading k="admin.bookings.title" :level="1" />
      <Button label="admin.bookings.create" @click="openManual()" />
    </Inline>

    <Inline :gap="3" wrap class="panel">
      <Tabs
        :model-value="filters.view"
        :items="views"
        label="admin.bookings.view"
        @update:model-value="(value) => update({ view: value === 'list' ? 'list' : 'day' })"
      />
      <template v-if="filters.view === 'day'">
        <IconButton
          icon-only="chevron-left"
          ariaLabel="admin.bookings.prev"
          variant="secondary"
          @click="shift(-1)"
        />
        <Button label="admin.bookings.today" variant="secondary" @click="today" />
        <IconButton
          icon-only="chevron-right"
          ariaLabel="admin.bookings.next"
          variant="secondary"
          @click="shift(1)"
        />
        <Field v-slot="{ id }" label="admin.bookings.date" class="panel__date">
          <Input
            :id="id"
            :model-value="filters.date"
            type="date"
            autocomplete="off"
            @update:model-value="(value) => value && update({ date: value })"
          />
        </Field>
      </template>
    </Inline>

    <CalendarDay
      v-if="filters.view === 'day'"
      :date="filters.date"
      @select-booking="openBooking"
      @select-cell="openManual"
    />
    <BookingsList
      v-else
      :filters="filters"
      :has-active="hasActive"
      :date-range-invalid="dateRangeInvalid"
      @update="update"
      @reset="reset"
      @open="openBooking"
    />

    <BookingDrawer :id="openId" @close="closeBooking" />
    <ManualBookingDrawer :open="manualOpen" :initial="manualInitial" @close="manualOpen = false" />
  </Stack>
</template>

<style scoped>
.panel {
  align-items: end;
}

.panel__date {
  min-width: 11rem;
}
</style>
