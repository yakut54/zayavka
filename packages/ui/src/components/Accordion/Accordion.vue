<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { useId } from 'vue'

import Icon from '../Icon/Icon.vue'
import Text from '../Text/Text.vue'

export interface AccordionItem {
  id: string
  title: MessageKey
  body: MessageKey
}

defineProps<{
  items: AccordionItem[]
  /** id пункта, раскрытого сразу. */
  openId?: string
}>()

const group = useId()
</script>

<template>
  <div class="ui-accordion">
    <details
      v-for="item in items"
      :key="item.id"
      class="ui-accordion__item"
      :name="group"
      :open="item.id === openId"
    >
      <summary class="ui-accordion__summary">
        <Text :k="item.title" variant="body-lg" weight="semibold" as="span" />
        <Icon name="chevron-down" class="ui-accordion__chevron" />
      </summary>
      <Text :k="item.body" tone="muted" as="p" class="ui-accordion__body" />
    </details>
  </div>
</template>

<style scoped>
.ui-accordion {
  border-block-start: 1px solid var(--color-border-strong);
}

.ui-accordion__item {
  border-block-end: 1px solid var(--color-border-strong);
}

.ui-accordion__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: var(--control-height-lg);
  padding-block: var(--space-3);
  list-style: none;
  cursor: pointer;
}

.ui-accordion__summary::-webkit-details-marker {
  display: none;
}

.ui-accordion__chevron {
  color: var(--color-text-muted);
  transition: transform var(--duration-normal) var(--ease-standard);
}

.ui-accordion__item[open] .ui-accordion__chevron {
  transform: rotate(180deg);
}

.ui-accordion__body {
  margin: 0;
  padding-block-end: var(--space-4);
}
</style>
