<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { useI18n } from 'vue-i18n'

import Icon from '../Icon/Icon.vue'
import Skeleton from '../Skeleton/Skeleton.vue'
import Text from '../Text/Text.vue'
import VisuallyHidden from '../VisuallyHidden/VisuallyHidden.vue'

export interface DataTableColumn {
  key: string
  label: MessageKey
  align?: 'start' | 'center' | 'end'
  width?: string
  sortable?: boolean
}

export type DataTableRow = Record<string, unknown>

export interface DataTableSort {
  key: string
  direction: 'asc' | 'desc'
}

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn[]
    rows: DataTableRow[]
    rowKey: string | ((row: DataTableRow) => string | number)
    /** Визуально скрытая подпись таблицы. */
    caption: MessageKey
    loading?: boolean
    clickable?: boolean
    sort?: DataTableSort
    skeletonRows?: number
  }>(),
  { skeletonRows: 10 },
)

const emit = defineEmits<{ 'row-click': [row: DataTableRow]; sort: [key: string] }>()

defineSlots<{
  [cell: `cell-${string}`]: (props: { row: DataTableRow; value: unknown }) => unknown
  empty?: () => unknown
}>()

const { t } = useI18n()

const keyOf = (row: DataTableRow): string | number =>
  typeof props.rowKey === 'function' ? props.rowKey(row) : (row[props.rowKey] as string | number)

function ariaSort(column: DataTableColumn): 'ascending' | 'descending' | 'none' | undefined {
  if (!column.sortable) return undefined
  if (props.sort?.key !== column.key) return 'none'
  return props.sort.direction === 'asc' ? 'ascending' : 'descending'
}

function onRowClick(row: DataTableRow): void {
  if (props.clickable) emit('row-click', row)
}
</script>

<template>
  <div class="ui-table-wrap">
    <table class="ui-table" :aria-busy="loading ? 'true' : undefined">
      <caption>
        <VisuallyHidden><Text :k="caption" /></VisuallyHidden>
      </caption>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
            :class="`ui-table__th--${column.align ?? 'start'}`"
            :style="column.width ? { width: column.width } : undefined"
            :aria-sort="ariaSort(column)"
          >
            <button
              v-if="column.sortable"
              type="button"
              class="ui-table__sort"
              @click="emit('sort', column.key)"
            >
              <Text :k="column.label" variant="label" as="span" />
              <Icon
                v-if="sort?.key === column.key"
                :name="sort.direction === 'asc' ? 'chevron-up' : 'chevron-down'"
                size="sm"
              />
            </button>
            <Text v-else :k="column.label" variant="label" as="span" />
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-if="loading">
          <tr v-for="n in skeletonRows" :key="`skeleton-${n}`" class="ui-table__row">
            <td v-for="column in columns" :key="column.key" :data-label="t(column.label)">
              <Skeleton height="1rem" />
            </td>
          </tr>
        </template>
        <template v-else-if="rows.length > 0">
          <tr
            v-for="row in rows"
            :key="keyOf(row)"
            :class="['ui-table__row', { 'ui-table__row--clickable': clickable }]"
            :tabindex="clickable ? 0 : undefined"
            @click="onRowClick(row)"
            @keydown.enter="onRowClick(row)"
          >
            <td
              v-for="column in columns"
              :key="column.key"
              :class="`ui-table__td--${column.align ?? 'start'}`"
              :data-label="t(column.label)"
            >
              <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
                {{ row[column.key] }}
              </slot>
            </td>
          </tr>
        </template>
        <tr v-else>
          <td :colspan="columns.length" class="ui-table__empty">
            <slot name="empty"><Text k="ui.table.empty" tone="muted" /></slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ui-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.ui-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--color-surface);
  color: var(--color-text);
}

.ui-table th {
  position: sticky;
  inset-block-start: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-muted);
  border-block-end: 1px solid var(--color-border-strong);
  text-align: start;
  white-space: nowrap;
}

.ui-table td {
  padding: var(--space-3) var(--space-4);
  border-block-end: 1px solid var(--color-border);
  vertical-align: middle;
}

.ui-table__th--center,
.ui-table__td--center {
  text-align: center;
}

.ui-table__th--end,
.ui-table__td--end {
  text-align: end;
}

.ui-table__sort {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.ui-table__row--clickable {
  cursor: pointer;
}

.ui-table__row--clickable:hover td {
  background: var(--color-accent-subtle);
}

.ui-table__row--clickable:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: calc(var(--focus-ring-width) * -1);
}

.ui-table__empty {
  padding: var(--space-8);
  text-align: center;
}

/* на мобильном строки превращаются в карточки */
@media (max-width: 768px) {
  .ui-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .ui-table,
  .ui-table tbody,
  .ui-table tr,
  .ui-table td {
    display: block;
    width: 100%;
  }

  .ui-table__row {
    margin-block-end: var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .ui-table td {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    text-align: end;
  }

  .ui-table td::before {
    content: attr(data-label);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    text-align: start;
  }
}
</style>
