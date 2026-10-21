<script setup lang="ts">
import { ApiError } from '@app/api-client'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Heading,
  IconButton,
  Inline,
  Input,
  Pagination,
  SearchInput,
  Select,
  Stack,
  Text,
  useToast,
} from '@app/ui'
import type { DataTableColumn, DataTableRow, DataTableSort, SelectOption } from '@app/ui'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { adminConfig } from '../../admin.config'
import { displayPhone, formatDateTime } from '../format'
import { useCopyPhone } from '../features/leads/clipboard'
import LeadDrawer from '../features/leads/LeadDrawer.vue'
import { type Lead, downloadLeadsCsv, useLeadsQuery } from '../features/leads/queries'
import { STATUSES, STATUS_TONE, isLeadStatus, statusLabel } from '../features/leads/statuses'
import { useLeadFilters } from '../features/leads/useLeadFilters'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const copyPhone = useCopyPhone()
const { filters, hasActive, dateRangeInvalid, update, reset } = useLeadFilters()
const leads = useLeadsQuery(filters)
const exporting = ref(false)

const columns: DataTableColumn[] = [
  { key: 'public_number', label: 'admin.leads.columns.number' },
  { key: 'created_at', label: 'admin.leads.columns.date', sortable: true },
  { key: 'name', label: 'admin.leads.columns.name' },
  { key: 'phone_e164', label: 'admin.leads.columns.phone' },
  { key: 'service_slug', label: 'admin.leads.columns.service' },
  { key: 'status', label: 'admin.leads.columns.status' },
]

const statusOptions: SelectOption[] = STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))

const rows = computed<DataTableRow[]>(
  () => (leads.data.value?.items ?? []) as unknown as DataTableRow[],
)
const total = computed(() => leads.data.value?.total ?? 0)
const sort = computed<DataTableSort>(() => ({
  key: 'created_at',
  direction: filters.value.sort === 'created_at' ? 'asc' : 'desc',
}))
const errorCode = computed(() =>
  leads.error.value instanceof ApiError ? leads.error.value.code : 'internal_error',
)
const openId = computed(() => (typeof route.params.id === 'string' ? route.params.id : undefined))
const lead = (row: DataTableRow) => row as unknown as Lead

function openLead(row: DataTableRow): void {
  void router.push({ name: 'leads', params: { id: lead(row).id }, query: route.query })
}

function closeLead(): void {
  void router.push({ name: 'leads', params: {}, query: route.query })
}

function toggleSort(): void {
  void update({ sort: filters.value.sort === 'created_at' ? '-created_at' : 'created_at' })
}

async function exportCsv(): Promise<void> {
  exporting.value = true
  try {
    await downloadLeadsCsv(filters.value)
  } catch {
    toast.error('admin.leads.exportFailed')
  } finally {
    exporting.value = false
  }
}

const onStatus = (value: string): void => {
  void update({ status: isLeadStatus(value) ? value : '' })
}
</script>

<template>
  <Stack :gap="5">
    <Inline :gap="3" justify="between" wrap>
      <Heading k="admin.leads.title" :level="1" />
      <Text v-if="leads.data.value" k="admin.leads.count" :plural="total" tone="muted" as="p" />
    </Inline>

    <div class="toolbar">
      <Field v-slot="{ id }" label="admin.leads.search">
        <SearchInput
          :id="id"
          :model-value="filters.q"
          @update:model-value="(value) => update({ q: value })"
        />
      </Field>
      <Field v-slot="{ id }" label="admin.leads.status">
        <Select
          :id="id"
          :model-value="filters.status"
          :options="statusOptions"
          placeholder="admin.leads.statusAll"
          @update:model-value="onStatus"
        />
      </Field>
      <Field v-slot="{ id }" label="admin.leads.dateFrom">
        <Input
          :id="id"
          :model-value="filters.dateFrom"
          type="date"
          autocomplete="off"
          :max="filters.dateTo || undefined"
          @update:model-value="(value) => update({ dateFrom: value })"
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
          @update:model-value="(value) => update({ dateTo: value })"
        />
      </Field>
      <div class="toolbar__actions">
        <Button v-if="hasActive" label="admin.leads.reset" variant="ghost" @click="reset" />
        <Button
          label="admin.leads.export"
          variant="secondary"
          icon-start="download"
          :loading="exporting"
          @click="exportCsv"
        />
      </div>
    </div>

    <ErrorState v-if="leads.isError.value" :code="errorCode" @retry="leads.refetch()" />
    <template v-else>
      <EmptyState
        v-if="!leads.isPending.value && rows.length === 0 && hasActive"
        title="admin.leads.notFound"
        description="admin.leads.notFoundHint"
        icon="search"
      >
        <Button label="admin.leads.reset" variant="secondary" @click="reset" />
      </EmptyState>
      <EmptyState
        v-else-if="!leads.isPending.value && rows.length === 0"
        title="admin.leads.empty"
        description="admin.leads.emptyHint"
      />
      <DataTable
        v-else
        :columns="columns"
        :rows="rows"
        row-key="id"
        caption="admin.leads.caption"
        :loading="leads.isPending.value"
        :sort="sort"
        clickable
        @row-click="openLead"
        @sort="toggleSort"
      >
        <template #cell-public_number="{ row }">
          <span :class="{ 'cell--new': lead(row).status === 'new' }">{{
            lead(row).public_number
          }}</span>
        </template>
        <template #cell-created_at="{ row }">
          <span :class="{ 'cell--new': lead(row).status === 'new' }">{{
            formatDateTime(lead(row).created_at)
          }}</span>
        </template>
        <template #cell-name="{ row }">
          <span
            class="cell__name"
            :class="{ 'cell--new': lead(row).status === 'new' }"
            :title="lead(row).name"
            >{{ lead(row).name }}</span
          >
        </template>
        <template #cell-phone_e164="{ row }">
          <span class="cell__phone">
            <span :class="{ 'cell--new': lead(row).status === 'new' }">{{
              displayPhone(lead(row).phone_e164)
            }}</span>
            <IconButton
              icon-only="copy"
              ariaLabel="admin.leads.copyPhone"
              size="sm"
              @click.stop="copyPhone(lead(row).phone_e164)"
              @keydown.enter.stop
            />
          </span>
        </template>
        <template #cell-service_slug="{ row }">
          <Text
            v-if="lead(row).service_slug && adminConfig.services[lead(row).service_slug as string]"
            :k="adminConfig.services[lead(row).service_slug as string] as never"
            as="span"
          />
          <Text v-else k="admin.leads.noService" as="span" tone="muted" />
        </template>
        <template #cell-status="{ row }">
          <Badge :k="statusLabel(lead(row).status)" :tone="STATUS_TONE[lead(row).status]" />
        </template>
      </DataTable>

      <Pagination
        v-if="total > 0"
        :page="filters.page"
        :page-size="adminConfig.pageSize"
        :total="total"
        @update:page="(page) => update({ page })"
      />
    </template>

    <LeadDrawer :id="openId" @close="closeLead" />
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

.cell--new {
  font-weight: 700;
}

.cell__name {
  display: inline-block;
  max-width: 16rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
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

@media (min-width: 1024px) {
  .toolbar {
    grid-template-columns: 2fr 1fr 1fr 1fr auto;
  }
}
</style>
