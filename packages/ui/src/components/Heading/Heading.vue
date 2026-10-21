<script setup lang="ts">
import type { MessageArgs, MessageKey } from '@app/i18n'
import { computed } from 'vue'

import Text, { type TextVariant } from '../Text/Text.vue'

const props = withDefaults(
  defineProps<{
    k: MessageKey
    args?: MessageArgs
    /** Семантический уровень: рендерит h1–h4. */
    level: 1 | 2 | 3 | 4
    /** Внешний вид отделён от уровня. */
    variant?: 'display' | 'h1' | 'h2' | 'h3'
    align?: 'start' | 'center'
  }>(),
  { align: 'start' },
)

const DEFAULT_VARIANT: Record<1 | 2 | 3 | 4, TextVariant> = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h3' }

const tag = computed(() => `h${props.level}`)
const variant = computed(() => props.variant ?? DEFAULT_VARIANT[props.level])
</script>

<template>
  <component :is="tag" class="ui-heading">
    <Text :k="k" :args="args" :variant="variant" :align="align" as="span" />
  </component>
</template>

<style scoped>
.ui-heading {
  margin: 0;
  font: inherit;
}

.ui-heading :deep(.ui-text) {
  display: block;
}
</style>
