<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { nextTick, useId } from 'vue'

import Text from '../Text/Text.vue'

export interface TabItem {
  id: string
  label: MessageKey
  badge?: number
}

const props = defineProps<{
  items: TabItem[]
  modelValue: string
  /** Подпись списка вкладок для скринридеров. */
  label: MessageKey
}>()

const emit = defineEmits<{ 'update:modelValue': [id: string] }>()

const uid = useId()
const tabId = (id: string) => `${uid}-tab-${id}`
const panelId = (id: string) => `${uid}-panel-${id}`

function targetIndex(key: string, current: number): number {
  const count = props.items.length
  if (key === 'ArrowRight') return (current + 1) % count
  if (key === 'ArrowLeft') return (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return -1
}

/** Стрелки, Home и End переключают вкладку и переносят на неё фокус (автоактивация). */
async function onKeydown(event: KeyboardEvent): Promise<void> {
  const current = props.items.findIndex((item) => item.id === props.modelValue)
  const next = props.items[targetIndex(event.key, current)]
  if (!next) return
  event.preventDefault()
  emit('update:modelValue', next.id)
  await nextTick()
  document.getElementById(tabId(next.id))?.focus()
}
</script>

<template>
  <div class="ui-tabs">
    <div class="ui-tabs__list" role="tablist" :aria-label="$t(label)" @keydown="onKeydown">
      <button
        v-for="item in items"
        :id="tabId(item.id)"
        :key="item.id"
        type="button"
        role="tab"
        class="ui-tabs__tab"
        :aria-selected="item.id === modelValue"
        :aria-controls="panelId(item.id)"
        :tabindex="item.id === modelValue ? 0 : -1"
        @click="emit('update:modelValue', item.id)"
      >
        <Text :k="item.label" weight="medium" as="span" />
        <span v-if="item.badge !== undefined" class="ui-tabs__badge">{{ item.badge }}</span>
      </button>
    </div>
    <template v-for="item in items" :key="item.id">
      <div
        v-if="item.id === modelValue"
        :id="panelId(item.id)"
        role="tabpanel"
        class="ui-tabs__panel"
        :aria-labelledby="tabId(item.id)"
        tabindex="0"
      >
        <slot :name="item.id" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.ui-tabs__list {
  display: flex;
  gap: var(--space-1);
  overflow-x: auto;
  border-block-end: 1px solid var(--color-border-strong);
}

.ui-tabs__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--control-height-md);
  padding: 0 var(--space-4);
  border: 0;
  border-block-end: 2px solid transparent;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}

.ui-tabs__tab:hover {
  color: var(--color-text);
}

.ui-tabs__tab[aria-selected='true'] {
  border-block-end-color: var(--color-accent);
  color: var(--color-text);
}

.ui-tabs__tab:focus-visible,
.ui-tabs__panel:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: calc(var(--focus-ring-width) * -1);
}

.ui-tabs__badge {
  min-width: 1.5rem;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--color-accent-subtle);
  color: var(--color-accent);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.5rem;
  text-align: center;
}

.ui-tabs__panel {
  padding-block: var(--space-4);
}
</style>
