<script setup lang="ts">
import type { MessageKey } from '@app/i18n'
import { computed } from 'vue'

import Heading from '../Heading/Heading.vue'
import Text from '../Text/Text.vue'

const props = defineProps<{ step: number; total: number; title: MessageKey }>()

const percent = computed(() => Math.min(100, Math.max(0, (props.step / props.total) * 100)))
</script>

<template>
  <header class="ui-step-header">
    <Text k="ui.step.progress" :args="{ step, total }" variant="caption" tone="muted" as="p" />
    <div
      class="ui-step-header__track"
      role="progressbar"
      :aria-valuemin="1"
      :aria-valuemax="total"
      :aria-valuenow="step"
      :aria-label="$t('ui.step.progress', { step, total })"
    >
      <div class="ui-step-header__bar" :style="{ '--progress': `${percent}%` }" />
    </div>
    <Heading :k="title" :level="2" variant="h2" />
  </header>
</template>

<style scoped>
.ui-step-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ui-step-header p {
  margin: 0;
}

.ui-step-header__track {
  block-size: 4px;
  border-radius: var(--radius-full);
  background: var(--color-surface-muted);
  overflow: hidden;
}

.ui-step-header__bar {
  block-size: 100%;
  inline-size: var(--progress);
  background: var(--color-accent);
  transition: inline-size var(--duration-normal) var(--ease-standard);
}

@media (prefers-reduced-motion: reduce) {
  .ui-step-header__bar {
    transition: none;
  }
}
</style>
