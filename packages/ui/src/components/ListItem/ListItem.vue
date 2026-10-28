<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

import Icon from '../Icon/Icon.vue'

const props = defineProps<{
  title: string
  subtitle?: string
  meta?: string
  /** Переход по маршруту; без `to` и `interactive` строка не кликабельна. */
  to?: RouteLocationRaw
  /** Кнопка с событием `click` (если нет `to`). */
  interactive?: boolean
}>()

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const tag = computed(() => (props.to ? RouterLink : props.interactive ? 'button' : 'div'))
const tagProps = computed(() =>
  props.to ? { to: props.to } : props.interactive ? { type: 'button' } : {},
)
const clickable = computed(() => Boolean(props.to) || props.interactive)
</script>

<template>
  <component
    :is="tag"
    v-bind="tagProps"
    :class="['ui-list-item', { 'ui-list-item--clickable': clickable }]"
    @click="emit('click', $event)"
  >
    <span v-if="$slots.leading" class="ui-list-item__leading"><slot name="leading" /></span>
    <span class="ui-list-item__body">
      <span class="ui-list-item__title">{{ title }}</span>
      <span v-if="subtitle" class="ui-list-item__subtitle">{{ subtitle }}</span>
    </span>
    <span v-if="meta || $slots.meta" class="ui-list-item__meta">
      <slot name="meta">{{ meta }}</slot>
    </span>
    <Icon v-if="clickable" name="chevron-right" class="ui-list-item__chevron" />
  </component>
</template>

<style scoped>
.ui-list-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  inline-size: 100%;
  min-block-size: var(--control-height-lg);
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-block-end: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  text-align: start;
  text-decoration: none;
}

.ui-list-item--clickable {
  cursor: pointer;
}

.ui-list-item--clickable:hover {
  background: var(--color-surface-muted);
}

.ui-list-item:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: calc(var(--focus-ring-width) * -1);
}

.ui-list-item__leading {
  flex: 0 0 auto;
}

.ui-list-item__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-1);
  min-inline-size: 0;
}

.ui-list-item__title {
  font-weight: 600;
}

.ui-list-item__subtitle,
.ui-list-item__meta {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.ui-list-item__meta {
  flex: 0 0 auto;
  text-align: end;
}

.ui-list-item__chevron {
  flex: 0 0 auto;
  color: var(--color-text-muted);
}
</style>
