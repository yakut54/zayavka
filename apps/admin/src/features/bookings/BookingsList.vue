<script setup lang="ts">
import { ApiError } from '@app/api-client'
import { T } from '@app/i18n'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Pagination,
  SearchInput,
  Select,
  Stack,
  Text,
  useToast,
} from '@app/ui'
import type { DataTableColumn, DataTableRow, SelectOption } from '@app/ui'
import { computed, ref } from 'vue'

import { adminConfig } from '../../../admin.config'
import { displayPhone, formatDateTime } from '../../format'
import { useCopyPhone } from '../leads/clipboard'
import {
  type Booking,
  type BookingFilters,
  downloadBookingsCsv,
  useBookingsQuery,
  useResourcesQuery,
} from './queries'
import {
  BOOKING_STATUSES,
  BOOKING_TONE,
  bookingStatusLabel,
  isBookingStatus,
  sourceLabel,
} from './statuses'

const props = defineProps<{
  filters: BookingFilters
  hasActive: boolean
  dateRangeInvalid: boolean
}>()
const emit = defineEmits<{
  update: [patch: Partial<BookingFilters>]
  reset: []
  open: [id: string]
}>()

const toast = useToast()
const copyPhone = useCopyPhone()
const bookings = useBookingsQuery(() => props.filters)
const resources = useResourcesQuery()
const exporting = ref(false)

const columns: DataTableColumn[] = [
  { key: 'public_number', label: 'admin.bookings.columns.number' },
  { key: 'starts_at', label: 'admin.bookings.columns.when' },
  { key: 'resource', label: 'admin.bookings.columns.resource' },
  { key: 'service', label: 'admin.bookings.columns.service' },
  { key: 'client_name', label: 'admin.bookings.columns.client' },
  { key: 'client_phone_e164', label: 'admin.bookings.columns.phone' },
  { key: 'source', label: 'admin.bookings.columns.source' },
  { key: 'status', label: 'admin.bookings.columns.status' },
]

const statusOptions: SelectOption[] = BOOKING_STATUSES.map((s) => ({
  value: s,
  text: T(bookingStatusLabel(s)),
}))
const resourceOptions = computed<SelectOption[]>(() =>
  (resources.data.value ?? []).map((r) => ({ value: r.id, text: r.name })),
)

const rows = computed(() => (bookings.data.value?.items ?? []) as unknown as DataTableRow[])
const total = computed(() => bookings.data.value?.total ?? 0)
const item = (row: DataTableRow) => row as unknown as Booking
const errorCode = computed(() =>
  bookings.error.value instanceof ApiError ? bookings.error.value.code : 'internal_error',
)
const rangeTooLong = computed(
  () => bookings.error.value instanceof ApiError && bookings.error.value.status === 422,
)

async function exportCsv(): Promise<void> {
  exporting.value = true
  try {
    await downloadBookingsCsv(props.filters)
  } catch {
    toast.error('admin.bookings.exportFailed')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <Stack :gap="5">
    <div class="toolbar">
      <Field v-slot="{ id }" label="admin.bookings.search">
        <SearchInput
          :id="id"
          :model-value="filters.q"
          @update:model-value="(value) => emit('update', { q: value })"
        />
      </Field>
      <Field v-slot="{ id }" label="admin.bookings.status">
        <Select
          :id="id"
          :model-value="filters.status"
          :options="statusOptions"
          placeholder="admin.bookings.statusAll"
          @update:model-value="
            (value) => emit('update', { status: isBookingStatus(value) ? value : '' })
          "
        />
      </Field>
      <Field v-slot="{ id }" label="admin.bookings.resource">
        <Select
          :id="id"
          :model-value="filters.resourceId"
          :options="resourceOptions"
          placeholder="admin.bookings.resourceAll"
          @update:model-value="(value) => emit('update', { resourceId: value })"
        />
      </Field>
      <Field v-slot="{ id }" label="admin.leads.dateFrom">
        <Input
          :id="id"
          :model-value="filters.dateFrom"
          type="date"
          autocomplete="off"
          :max="filters.dateTo || undefined"
          @update:model-value="(value) => emit('update', { dateFrom: value })"
        />
      </Field>
      <Field
        v-slot="{ id, describedBy, invalid }"
        label="admin.leads.dateTo"
        :error="dateRangeInvalid ? 'admin.leads.dateRangeError' : undefined"
      >
        <Input
          :id="id"
          :aria-describedby="describedBy"
          :invalid="invalid"
          :model-value="filters.dateTo"
          type="date"
          autocomplete="off"
          :min="filters.dateFrom || undefined"
          @update:model-value="(value) => emit('update', { dateTo: value })"
        />
      </Field>
      <div class="toolbar__actions">
        <Button v-if="hasActive" label="admin.leads.reset" variant="ghost" @click="emit('reset')" />
        <Button
          label="admin.leads.export"
          variant="secondary"
          icon-start="download"
          :loading="exporting"
          @click="exportCsv"
        />
      </div>
    </div>

    <Text v-if="bookings.data.value" k="admin.bookings.count" :plural="total" tone="muted" as="p" />

    <EmptyState
      v-if="rangeTooLong"
      title="admin.bookings.rangeTooLong"
      description="admin.bookings.rangeTooLongHint"
      icon="alert-circle"
    />
    <ErrorState v-else-if="bookings.isError.value" :code="errorCode" @retry="bookings.refetch()" />
    <template v-else>
      <EmptyState
        v-if="!bookings.isPending.value && rows.length === 0 && hasActive"
        title="admin.bookings.notFound"
        description="admin.bookings.notFoundHint"
        icon="search"
      >
        <Button label="admin.leads.reset" variant="secondary" @click="emit('reset')" />
      </EmptyState>
      <EmptyState
        v-else-if="!bookings.isPending.value && rows.length === 0"
        title="admin.bookings.empty"
        description="admin.bookings.emptyHint"
      />
      <DataTable
        v-else
        :columns="columns"
        :rows="rows"
        row-key="id"
        caption="admin.bookings.caption"
        :loading="bookings.isPending.value"
        clickable
        @row-click="(row) => emit('open', item(row).id)"
      >
        <template #cell-starts_at="{ row }">{{ formatDateTime(item(row).starts_at) }}</template>
        <template #cell-resource="{ row }">{{ item(row).resource.name }}</template>
        <template #cell-service="{ row }">{{ item(row).service.title }}</template>
        <template #cell-client_phone_e164="{ row }">
          <span class="cell__phone">
            <span>{{ displayPhone(item(row).client_phone_e164) }}</span>
            <IconButton
              icon-only="copy"
              ariaLabel="admin.leads.copyPhone"
              size="sm"
              @click.stop="copyPhone(item(row).client_phone_e164)"
              @keydown.enter.stop
            />
          </span>
        </template>
        <template #cell-source="{ row }">
          <Badge
            :k="item(row).is_demo ? 'admin.bookings.sources.demo' : sourceLabel(item(row).source)"
            tone="muted"
          />
        </template>
        <template #cell-status="{ row }">
          <Badge :k="bookingStatusLabel(item(row).status)" :tone="BOOKING_TONE[item(row).status]" />
        </template>
      </DataTable>

      <Pagination
        v-if="total > 0"
        :page="filters.page"
        :page-size="adminConfig.pageSize"
        :total="total"
        @update:page="(page) => emit('update', { page })"
      />
    </template>
  </Stack>
</template>

<style scoped>
.toolbar {
  display: grid;
  gap: var(--space-4);
  align-items: end;
}

.toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.cell__phone {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

@media (min-width: 768px) {
  .toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .toolbar {
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto;
  }
}
</style>
