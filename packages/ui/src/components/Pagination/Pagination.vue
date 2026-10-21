<script setup lang="ts">
import { computed } from 'vue'

import Button from '../Button/Button.vue'
import Text from '../Text/Text.vue'

const props = defineProps<{ page: number; pageSize: number; total: number }>()
const emit = defineEmits<{ 'update:page': [page: number] }>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const to = computed(() => Math.min(props.page * props.pageSize, props.total))

/** Номера страниц с многоточиями: 1 … 4 5 [6] 7 8 … 20. */
const items = computed<(number | 'gap-start' | 'gap-end')[]>(() => {
  const last = pageCount.value
  const current = props.page
  const pages = new Set(
    [1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last),
  )
  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | 'gap-start' | 'gap-end')[] = []
  sorted.forEach((p, index) => {
    const prev = sorted[index - 1]
    if (prev !== undefined && p - prev > 1) result.push(prev === 1 ? 'gap-start' : 'gap-end')
    result.push(p)
  })
  return result
})

function go(page: number): void {
  if (page >= 1 && page <= pageCount.value && page !== props.page) emit('update:page', page)
}
</script>

<template>
  <div class="ui-pagination">
    <Text
      k="ui.pagination.shown"
      :args="{ from, to, total }"
      variant="body-sm"
      tone="muted"
      as="p"
    />
    <nav v-if="pageCount > 1" :aria-label="$t('ui.pagination.label')">
      <ul class="ui-pagination__list">
        <li>
          <Button
            label="ui.pagination.prev"
            variant="ghost"
            size="sm"
            :disabled="page <= 1"
            @click="go(page - 1)"
          />
        </li>
        <li v-for="item in items" :key="item">
          <span v-if="typeof item === 'string'" class="ui-pagination__gap" aria-hidden="true"
            >…</span
          >
          <button
            v-else
            type="button"
            :class="['ui-pagination__page', { 'ui-pagination__page--current': item === page }]"
            :aria-current="item === page ? 'page' : undefined"
            :aria-label="$t('ui.pagination.page', { page: item })"
            @click="go(item)"
          >
            {{ item }}
          </button>
        </li>
        <li>
          <Button
            label="ui.pagination.next"
            variant="ghost"
            size="sm"
            :disabled="page >= pageCount"
            @click="go(page + 1)"
          />
        </li>
      </ul>
    </nav>
  </div>
</template>

<style scoped>
.ui-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.ui-pagination__list {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ui-pagination__page {
  min-width: var(--control-height-sm);
  min-height: var(--control-height-sm);
  padding: 0 var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}

.ui-pagination__page:hover {
  background: var(--color-surface-muted);
}

.ui-pagination__page--current {
  background: var(--color-accent);
  color: var(--color-text-inverse);
}

.ui-pagination__page--current:hover {
  background: var(--color-accent-hover);
}

.ui-pagination__gap {
  padding: 0 var(--space-1);
  color: var(--color-text-muted);
}
</style>
